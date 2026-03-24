---
doc_type: policy
audience: bot
lang: en
tags: ['fastapi', 'python', 'api', 'backend', 'standards']
last_modified: 2026-03-10T15:51:37Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.py'
---

FASTAPI RULES
=============

## TL;DR

Treat Pydantic models as your public contract; always set `response_model`.
Use `Annotated` + `Depends()` for clean, type-safe dependency injection and parameter validation.
Use `async def` only with awaitable I/O; never run blocking I/O in the event loop.

ROUTERS
-------

Rules
-----

- Use one `APIRouter` per bounded domain (users, billing, auth, etc).
- Set `prefix="/..."` and `tags=["..."]` on every router.
- Prefer router-level dependencies for cross-cutting concerns (auth, tracing) instead of repeating per-endpoint.
- Keep path operation functions as orchestration only (no direct DB calls, no complex business logic).
- Target <= 30 lines per handler (excluding imports/models). If longer, move logic into a service function.
- Set explicit `status_code` for non-200 endpoints (create: `201`, delete: `204`) and match it with the response body.

Example
.......

```python
from typing import Annotated, Protocol
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/users", tags=["users"])

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str

class UserService(Protocol):
    async def get_user(self, user_id: UUID) -> object | None: ...

async def get_user_service() -> UserService:
    raise NotImplementedError

UserServiceDep = Annotated[UserService, Depends(get_user_service)]

@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: UUID, service: UserServiceDep) -> UserOut:
    user = await service.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)
```

SCHEMAS AND VALIDATION
----------------------

Rules
-----

- Use Pydantic v2 `BaseModel` for all request/response bodies. Do not introduce `pydantic.v1` in new code.
- Split schemas by intent: `XCreate` (input), `XOut` (response), `XPatch` (partial update). Do not reuse ORM models.
- For request bodies, default to `extra="forbid"` so unexpected fields fail fast.
- Constrain inputs with `Field()`, `Query()`, and `Path()` instead of manual `if` checks for basic validation.
- Use Pydantic v2 APIs: `model_validate()` and `model_dump()` (avoid v1 `parse_obj()` / `dict()`).
- For PATCH semantics: apply updates with `payload.model_dump(exclude_unset=True)`.

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

ItemId = Annotated[int, Path(ge=1)]
Limit = Annotated[int, Query(ge=1, le=100)]

@router.get("", response_model=list[int])
async def list_item_ids(limit: Limit = 50) -> list[int]:
    return list(range(1, limit + 1))

@router.post("", response_model=dict[str, str], status_code=status.HTTP_201_CREATED)
async def create_item(payload: Annotated[ItemCreate, Body()]) -> dict[str, str]:
    return {"name": payload.name}
```

DEPENDENCIES AND LIFESPAN
-------------------------

Rules
-----

- Use `Depends()` for per-request resources (DB session, current user) and for shared logic (pagination, feature flags).
- Prefer `Annotated[T, Depends(dep)]` over `t: T = Depends(dep)` for readability and type checking.
- Use `yield` dependencies for resources that need cleanup (close connections, release locks).
- Prefer `lifespan` for startup/shutdown resource management.
- Do not mix `lifespan` with `@app.on_event("startup"/"shutdown")` handlers; when `lifespan` is set, events are skipped.

Example
.......

```python
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import Annotated, Protocol

from fastapi import Depends, FastAPI

class Resource(Protocol):
    async def aclose(self) -> None: ...

async def create_resource() -> Resource:
    raise NotImplementedError

async def get_resource() -> AsyncGenerator[Resource, None]:
    res = await create_resource()
    try:
        yield res
    finally:
        await res.aclose()

ResourceDep = Annotated[Resource, Depends(get_resource)]

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.shared_resource = await create_resource()
    try:
        yield
    finally:
        await app.state.shared_resource.aclose()

app = FastAPI(lifespan=lifespan)
```

ASYNC AND IO
------------

Rules
-----

- Use `async def` only when you call awaitable I/O (async DB, `httpx.AsyncClient`, etc).
- If you must call a blocking library, prefer a sync endpoint (`def`) so FastAPI runs it in a threadpool.
- Never call blocking I/O directly inside `async def`. If unavoidable, offload with `anyio.to_thread.run_sync()`.
- Do not do CPU-heavy work in a request handler. Offload to a worker/queue or a process pool.

Example
.......

```python
import anyio
from fastapi import APIRouter

router = APIRouter()

def blocking_io() -> str:
    return "ok"

@router.get("/blocking-safe")
async def blocking_safe() -> dict[str, str]:
    result = await anyio.to_thread.run_sync(blocking_io)
    return {"result": result}
```

ERRORS AND STATUS CODES
-----------------------

Rules
-----

- Raise `HTTPException` with a correct status code and a clear, stable `detail` message.
- Prefer `fastapi.status` constants over magic numbers.
- Use global exception handlers to map domain exceptions to HTTP responses.
- Do not catch broad exceptions in handlers just to return `{"error": ...}`. Use exception handlers/middleware.
- For `204 No Content`, return an empty `Response` (no JSON body).

Example
.......

```python
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

app = FastAPI()

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

@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int) -> Response:
    if item_id < 1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

SECURITY BASICS
---------------

Rules
-----

- Enforce auth and authorization via dependencies (`Depends()` / `Security()`), not manual header parsing.
- Do not accept `user_id`/`tenant_id` from the client as the source of truth. Derive identity from the auth context.
- Keep CORS explicit: allow only known origins in production, and avoid `allow_credentials=True` with wildcard origins.
- Validate file uploads (size/type) and stream them; do not read large files into memory.

TESTING
-------

Rules
-----

- Use dependency overrides in tests (`app.dependency_overrides[...]`) instead of patching internals.
- Clear `dependency_overrides` after each test to avoid leakage between test cases.
- Prefer integration tests that assert on the public HTTP contract (status code, response body, response headers).
