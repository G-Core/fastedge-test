---
doc_type: policy
audience: bot
lang: en
tags: ['fastapi', 'python', 'api', 'backend', 'standards']
last_modified: 2026-03-15T17:54:20Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.py'
---

FASTAPI RULES
=============

## TL;DR

Pydantic models are your public contract. Declare a `response_model` or return type
for JSON responses. Use `response_model=None` for raw `Response`, streams, or redirects.
Use `Annotated[...]` with `Depends()`, `Query()`, `Path()`, `Body()`, `File()`, `Form()`.
Use `async def` for async work. Use `def` for blocking libraries.
Never run blocking I/O directly in the event loop.

ROUTERS
-------

Rules
-----

- Use one `APIRouter` per bounded domain (users, billing, auth, etc).
- Set `prefix="/..."` and `tags=["..."]` on domain routers. Omit only when a
  router is root-scoped or internal on purpose.
- Use router-level dependencies for shared concerns (auth, tracing, tenant
  resolution) instead of repeating them on each endpoint.
- Keep path operation functions short: parse input, call services, handle domain
  errors, return HTTP output.
- If a handler grows beyond ~30 lines (not counting imports and models), move
  logic into a service function.
- Set an explicit `status_code` for non-200 endpoints. Match it to the response
  meaning (`201` for create, `204` with no body, `202` for accepted async work).
- For JSON responses, declare `response_model` when it differs from the function
  return type or when you want FastAPI to filter and validate output.
- For raw `Response`, `StreamingResponse`, `FileResponse`, redirects, or SSE,
  set `response_model=None` and return the response class directly.

Example
.......

```python
from pathlib import Path
from typing import Annotated, Protocol
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/users", tags=["users"])

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str

class UserService(Protocol):
    async def get_user(self, user_id: UUID) -> object | None: ...
    async def get_avatar_path(self, user_id: UUID) -> Path | None: ...

async def get_user_service() -> UserService:
    raise NotImplementedError

UserServiceDep = Annotated[UserService, Depends(get_user_service)]

@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: UUID, service: UserServiceDep) -> UserOut:
    user = await service.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)

@router.get("/{user_id}/avatar", response_model=None)
async def get_user_avatar(user_id: UUID, service: UserServiceDep) -> Response:
    avatar_path = await service.get_avatar_path(user_id)
    if avatar_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User avatar not found",
        )
    return FileResponse(avatar_path)
```

SCHEMAS AND VALIDATION
----------------------

Rules
-----

- Use Pydantic v2 `BaseModel` for request and response bodies. Do not use
  `pydantic.v1` in new code.
- Split schemas by purpose: `XCreate` (input), `XOut` (response),
  `XPatch` (partial update). Do not reuse ORM models as API schemas.
- For request bodies, set `extra="forbid"` by default so unexpected fields
  fail fast. Document exceptions for passthrough payloads, webhook envelopes,
  or inputs that must stay forward-compatible.
- Use `Field()`, `Query()`, `Path()`, `Header()`, and related helpers to
  validate inputs instead of manual `if` checks.
- Use Pydantic v2 APIs: `model_validate()` and `model_dump()`
  (not v1 `parse_obj()` / `dict()`).
- To convert ORM or domain objects to response models, set
  `ConfigDict(from_attributes=True)` on the output model.
- For PATCH endpoints, merge updates with
  `payload.model_dump(exclude_unset=True)`.
- Use `exclude_none=True` only when `null` means "ignore this field". Do not
  use it when `null` is a valid update value.
- Use dedicated response models instead of `response_model_include` /
  `response_model_exclude`. Separate schemas keep OpenAPI accurate.
- Do not mix JSON `Body` fields with `File()` / `Form()` in the same
  endpoint. Multipart uploads use a different request format.

Example
.......

```python
from typing import Annotated

from fastapi import APIRouter, Body, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/items", tags=["items"])

class ItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=1)

class ItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    quantity: int | None = Field(default=None, ge=1)

class ItemOut(BaseModel):
    id: int
    name: str
    quantity: int

ItemId = Annotated[int, Path(ge=1)]
Limit = Annotated[int, Query(ge=1, le=100)]

@router.get("", response_model=list[ItemOut])
async def list_items(limit: Limit = 50) -> list[ItemOut]:
    return [ItemOut(id=i, name=f"item-{i}", quantity=1) for i in range(1, limit + 1)]

@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(payload: Annotated[ItemCreate, Body()]) -> ItemOut:
    stored = {"id": 1, **payload.model_dump()}
    return ItemOut.model_validate(stored)

@router.patch("/{item_id}", response_model=ItemOut)
async def patch_item(item_id: ItemId, payload: Annotated[ItemPatch, Body()]) -> ItemOut:
    stored = {"id": item_id, "name": "item-1", "quantity": 3}
    stored.update(payload.model_dump(exclude_unset=True))
    return ItemOut.model_validate(stored)
```

DEPENDENCIES AND LIFESPAN
-------------------------

Rules
-----

- Use `Depends()` for per-request resources (DB session, current user) and for
  shared logic (pagination, feature flags).
- Prefer `Annotated[T, Depends(dep)]` over `t: T = Depends(dep)` for
  readability and type checking.
- Use `yield` dependencies for resources that need cleanup (close sessions,
  release locks, roll back transactions).
- Use `lifespan` for app startup and shutdown resource management.
- Do not mix `lifespan` with `@app.on_event("startup"/"shutdown")` handlers.
  When `lifespan` is set, FastAPI does not call startup and shutdown event
  handlers.
- Keep dependency functions free of side effects except for resource setup,
  cleanup, and request-scoped checks.

Example
.......

```python
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Protocol

from fastapi import Depends, FastAPI

class Session(Protocol):
    async def close(self) -> None: ...

class HttpClient(Protocol):
    async def aclose(self) -> None: ...

async def create_session() -> Session:
    raise NotImplementedError

async def create_http_client() -> HttpClient:
    raise NotImplementedError

async def get_session() -> AsyncGenerator[Session, None]:
    session = await create_session()
    try:
        yield session
    finally:
        await session.close()

SessionDep = Annotated[Session, Depends(get_session)]

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = await create_http_client()
    try:
        yield
    finally:
        await app.state.http_client.aclose()

app = FastAPI(lifespan=lifespan)

@app.get("/ready", response_model=dict[str, bool])
async def ready(session: SessionDep) -> dict[str, bool]:
    return {"ok": True}
```

ASYNC AND IO
------------

Rules
-----

- Use `async def` when the handler awaits I/O or calls other async functions.
- Use a sync endpoint (`def`) when the main work uses a blocking library and
  you do not need async calls.
- Never call blocking I/O inside `async def`. If you cannot avoid it, use
  `anyio.to_thread.run_sync()`.
- FastAPI runs sync path operations and sync dependencies in a threadpool
  automatically. A regular helper you call from `async def` still runs on the
  event loop thread.
- Do not do CPU-heavy work in a request handler. Send it to a worker, queue,
  or process pool.
- Do not use `BackgroundTasks` for heavy or long-running jobs. Use a queue or
  worker system when the work must survive process restarts or scale across
  workers.

Example
.......

```python
import anyio
from fastapi import APIRouter

router = APIRouter()

def blocking_io() -> str:
    return "ok"

@router.get("/blocking-safe-sync")
def blocking_safe_sync() -> dict[str, str]:
    result = blocking_io()
    return {"result": result}

@router.get("/blocking-safe-async")
async def blocking_safe_async() -> dict[str, str]:
    result = await anyio.to_thread.run_sync(blocking_io)
    return {"result": result}
```

ERRORS AND STATUS CODES
-----------------------

Rules
-----

- Raise `HTTPException` with the correct status code and a clear, stable
  `detail` message.
- Use `fastapi.status` constants instead of raw numbers.
- Use global exception handlers to convert domain exceptions to HTTP responses.
- Do not catch broad exceptions in handlers just to return `{"error": ...}`.
  Use exception handlers or middleware instead.
- Use `Path()`, `Query()`, and related helpers to validate inputs instead of
  returning `404` or `400` by hand.
- For `204 No Content`, return an empty `Response` with no JSON body.
- If clients need machine-readable error codes, return them in a fixed field
  from a central handler.

Example
.......

```python
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, Request, Response, status
from fastapi.responses import JSONResponse

app = FastAPI()

ItemId = Annotated[int, Path(ge=1)]

class DomainError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": exc.code, "detail": exc.message},
    )

@app.get("/health", response_model=dict[str, str])
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_item(item_id: ItemId) -> Response:
    if item_id == 9999:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

SECURITY BASICS
---------------

Rules
-----

- Handle auth and authorization through dependencies (`Depends()` /
  `Security()`), not by parsing headers manually.
- Use `Security()` when you need security schemes or scopes in OpenAPI. Use
  `Depends()` for other shared logic.
- Do not accept `user_id` or `tenant_id` from the client as trusted input.
  Get identity and tenancy from the auth context.
- Set CORS origins explicitly. Allow only known origins in production. Do not
  combine `allow_credentials=True` with wildcard origins, methods, or headers.
- Use `UploadFile` instead of `bytes` for non-trivial uploads. Set size and
  type limits. Stream or process files step by step instead of reading them
  fully into memory.
- Treat `UploadFile.content_type` as a client-provided hint from headers, not
  as a trusted value.

Example
.......

```python
from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, Security, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/account", tags=["account"])

bearer_scheme = HTTPBearer(auto_error=False)
BearerCreds = Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)]

@router.get("/me")
async def read_me(credentials: BearerCreds) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    return {"subject": "derived-from-token"}

@router.post("/avatar", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def upload_avatar(file: UploadFile) -> Response:
    # Cheap allowlist first; add content sniffing for high-risk inputs.
    if file.content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type",
        )

    size = 0
    try:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > 5 * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File too large",
                )
    finally:
        await file.close()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

TESTING
-------

Rules
-----

- Use dependency overrides in tests (`app.dependency_overrides[...]`) instead
  of patching internals.
- Clear `dependency_overrides` after each test so state does not carry over
  between test cases.
- Write integration tests that check the public HTTP contract (status code,
  response body, response headers).
- Use `TestClient` for sync tests. For `async def` tests, use
  `httpx.AsyncClient` with `ASGITransport` instead of `TestClient`.
- If async tests need lifespan events, start lifespan explicitly (for example
  with a lifespan manager) or use `TestClient`.

Example
.......

```python
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

app = FastAPI()

async def get_current_user() -> str:
    return "real-user"

UserDep = Annotated[str, Depends(get_current_user)]

@app.get("/me")
async def read_me(user: UserDep) -> dict[str, str]:
    return {"user": user}

async def override_user() -> str:
    return "test-user"

def test_read_me() -> None:
    app.dependency_overrides[get_current_user] = override_user
    try:
        with TestClient(app) as client:
            response = client.get("/me")
        assert response.status_code == 200
        assert response.json() == {"user": "test-user"}
    finally:
        app.dependency_overrides = {}
```
