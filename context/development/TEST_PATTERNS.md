# Test Patterns and Best Practices

This document outlines testing patterns, conventions, and best practices for the proxy-runner project.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Backend Testing Patterns](#backend-testing-patterns)
- [Frontend Testing Patterns](#frontend-testing-patterns)
- [Mocking Strategies](#mocking-strategies)
- [Coverage Expectations](#coverage-expectations)
- [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)

## Testing Philosophy

### Test Organization

Tests are organized by functionality and follow the AAA pattern (Arrange, Act, Assert):

```typescript
describe("Feature/Component", () => {
  describe("specific behavior", () => {
    it("should do something specific", () => {
      // Arrange: Setup test data and mocks
      const input = "test";
      const mockFn = vi.fn();

      // Act: Execute the code under test
      const result = functionUnderTest(input, mockFn);

      // Assert: Verify the outcome
      expect(result).toBe("expected");
      expect(mockFn).toHaveBeenCalled();
    });
  });
});
```

### Test Naming Conventions

- **Describe blocks**: Use descriptive names for the feature/component being tested
  - Top level: Component/Class/Function name
  - Nested: Specific behavior or category (e.g., "Rendering", "Interaction", "Error handling")

- **Test cases**: Use "should" statements that describe expected behavior
  - Good: `"should serialize empty headers correctly"`
  - Bad: `"test serialization"` or `"empty headers"`

### Test Grouping

Group related tests using nested `describe` blocks:

```typescript
describe("HeaderManager", () => {
  describe("normalize()", () => {
    it("should convert header keys to lowercase", () => { ... });
    it("should convert non-string values to strings", () => { ... });
  });

  describe("serialize()", () => {
    it("should serialize empty headers correctly", () => { ... });
    it("should serialize single header pair", () => { ... });
  });
});
```

## Backend Testing Patterns

### Utility Function Testing

**Pattern**: Test pure functions with comprehensive input variations

**Example: HeaderManager.test.ts**

```typescript
describe("HeaderManager", () => {
  describe("normalize()", () => {
    it("should convert header keys to lowercase", () => {
      const headers: HeaderMap = {
        "Content-Type": "application/json",
        "X-Custom-Header": "value",
      };

      const result = HeaderManager.normalize(headers);

      expect(result).toEqual({
        "content-type": "application/json",
        "x-custom-header": "value",
      });
    });

    it("should handle empty headers object", () => {
      const result = HeaderManager.normalize({});
      expect(result).toEqual({});
    });
  });
});
```

**Key Points**:
- Test static methods directly (no instance creation needed)
- Cover edge cases: empty inputs, special characters, large inputs
- Use precise assertions with exact expected values
- Test both success and failure paths

### Binary Data Testing

**Pattern**: Working with binary formats (Uint8Array, ArrayBuffer)

**Example: HeaderManager.serialize()**

```typescript
it("should serialize single header pair with correct format", () => {
  const headers: HeaderMap = {
    "content-type": "application/json",
  };

  const result = HeaderManager.serialize(headers);
  const view = new DataView(result.buffer);

  // Check count
  expect(view.getUint32(0, true)).toBe(1);

  // Check key length
  expect(view.getUint32(4, true)).toBe(12); // "content-type"

  // Check value length
  expect(view.getUint32(8, true)).toBe(16); // "application/json"

  // Check key data
  const keyStart = 12;
  const keyBytes = result.slice(keyStart, keyStart + 12);
  const keyStr = new TextDecoder().decode(keyBytes);
  expect(keyStr).toBe("content-type");

  // Check null terminator
  expect(result[keyStart + 12]).toBe(0);
});
```

**Key Points**:
- Use `DataView` for reading multi-byte values
- Specify byte order explicitly (`true` for little-endian)
- Verify structure with exact byte positions
- Test UTF-8 encoding with special characters

### Class Instance Testing

**Pattern**: Test classes with state and methods

**Example: PropertyResolver.test.ts**

```typescript
describe("PropertyResolver", () => {
  let resolver: PropertyResolver;

  beforeEach(() => {
    resolver = new PropertyResolver();
  });

  describe("Property path resolution", () => {
    it("should resolve request.method from metadata", () => {
      resolver.setRequestMetadata({}, "POST");
      expect(resolver.resolve("request.method")).toBe("POST");
    });

    it("should resolve request.path from metadata", () => {
      resolver.setRequestMetadata({}, "GET", "/api/users");
      expect(resolver.resolve("request.path")).toBe("/api/users");
    });
  });
});
```

**Key Points**:
- Use `beforeEach` to create fresh instances for each test
- Test state changes and method interactions
- Verify method chaining and state accumulation
- Test default values and edge cases

### File System Mocking

**Pattern**: Mock Node.js file system operations

**Example: dotenv-loader.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadDotenvFiles } from "./dotenv-loader.js";
import fs from "fs/promises";

// Mock fs/promises module
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

describe("dotenv-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse simple KEY=value pairs", async () => {
    const mockContent = "KEY1=value1\nKEY2=value2";
    vi.mocked(fs.readFile).mockResolvedValue(mockContent);

    const result = await loadDotenvFiles("/test");

    expect(fs.readFile).toHaveBeenCalledWith(
      path.join("/test", ".env"),
      "utf-8"
    );
  });
});
```

**Key Points**:
- Mock entire module at the top level with `vi.mock()`
- Use `vi.mocked()` for TypeScript type inference
- Clear mocks between tests with `beforeEach`
- Mock resolved/rejected promises for async operations
- Test both success and error paths

### Comprehensive Edge Case Testing

**Pattern**: Test boundary conditions and error scenarios

```typescript
describe("edge cases and error conditions", () => {
  it("should handle headers with very long keys", () => {
    const longKey = "x-" + "a".repeat(1000);
    const headers: HeaderMap = { [longKey]: "value" };

    const result = HeaderManager.serialize(headers);
    expect(result.length).toBeGreaterThan(1000);
  });

  it("should handle empty values", () => {
    const headers: HeaderMap = { "x-empty": "" };
    const result = HeaderManager.serialize(headers);

    const view = new DataView(result.buffer);
    expect(view.getUint32(8, true)).toBe(0); // empty value length
  });

  it("should handle UTF-8 multibyte characters correctly", () => {
    const headers: HeaderMap = { "x-emoji": "🚀" };
    const result = HeaderManager.serialize(headers);
    const view = new DataView(result.buffer);

    // "🚀" is 4 bytes in UTF-8
    expect(view.getUint32(8, true)).toBe(4);
  });
});
```

## Frontend Testing Patterns

### Component Rendering Tests

**Pattern**: Test component output and state

**Example: Toggle.test.tsx**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  describe('Rendering', () => {
    it('renders with a label', () => {
      const onChange = vi.fn();
      render(<Toggle checked={false} onChange={onChange} label="Enable feature" />);

      expect(screen.getByText('Enable feature')).toBeInTheDocument();
    });

    it('applies custom styles', () => {
      const onChange = vi.fn();
      const customStyle = { marginTop: '20px' };
      const { container } = render(
        <Toggle checked={false} onChange={onChange} style={customStyle} />
      );

      const label = container.querySelector('label');
      const style = label?.getAttribute('style');
      expect(style).toContain('margin-top');
    });
  });
});
```

**Key Points**:
- Use `render()` from Testing Library to mount components
- Use `screen` queries for accessibility-first element selection
- Test both DOM structure and visual appearance
- Verify prop handling and styling

### User Interaction Tests

**Pattern**: Simulate user events and verify callbacks

**Example: Toggle interaction**

```typescript
import userEvent from '@testing-library/user-event';

describe('Interaction', () => {
  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <Toggle checked={false} onChange={onChange} />
    );

    const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
    await user.click(toggleSwitch!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <Toggle checked={false} onChange={onChange} disabled={true} />
    );

    const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
    await user.click(toggleSwitch!);

    expect(onChange).not.toHaveBeenCalled();
  });
});
```

**Key Points**:
- Use `userEvent` for realistic user interactions
- Always `await` user events (they're async)
- Verify callback functions are called with correct arguments
- Test both enabled and disabled states

### Complex Component Testing

**Pattern**: Test components with multiple inputs and dynamic rows

**Example: DictionaryInput.test.tsx**

```typescript
describe('DictionaryInput', () => {
  it('should render with provided values', () => {
    const value = { 'Content-Type': 'application/json', 'Accept': 'text/html' };
    render(<DictionaryInput value={value} onChange={mockOnChange} />);

    const keyInputs = screen.getAllByPlaceholderText('Key');
    const valueInputs = screen.getAllByPlaceholderText('Value');

    // 2 rows with data + 1 empty row at the end
    expect(keyInputs).toHaveLength(3);
    expect(keyInputs[0]).toHaveValue('Content-Type');
    expect(valueInputs[0]).toHaveValue('application/json');
  });

  it('should auto-add new row when typing', async () => {
    const user = userEvent.setup();
    render(<DictionaryInput value={{}} onChange={mockOnChange} />);

    const keyInputs = screen.getAllByPlaceholderText('Key');
    await user.type(keyInputs[0], 'NewKey');

    const updatedKeyInputs = screen.getAllByPlaceholderText('Key');
    expect(updatedKeyInputs).toHaveLength(2);
  });
});
```

**Key Points**:
- Test dynamic UI updates (adding/removing elements)
- Verify all input values after interactions
- Test auto-generated or conditional rows
- Use `getAllBy*` for multiple matching elements

### React Hook Testing

**Pattern**: Test custom React hooks in isolation

**Example: useWasm.test.ts**

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWasm } from './useWasm';
import * as api from '../api';

vi.mock('../api', () => ({
  uploadWasm: vi.fn(),
}));

describe('useWasm', () => {
  const mockUploadWasm = vi.mocked(api.uploadWasm);

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useWasm());

    expect(result.current.wasmState).toEqual({
      wasmPath: null,
      wasmBuffer: null,
      wasmFile: null,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should successfully load a WASM file', async () => {
    const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);
    mockUploadWasm.mockResolvedValue('test.wasm');

    const { result } = renderHook(() => useWasm());

    await act(async () => {
      await result.current.loadWasm(mockFile, true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.wasmState.wasmPath).toBe('test.wasm');
    expect(result.current.error).toBe(null);
  });
});
```

**Key Points**:
- Use `renderHook()` to test hooks without a component
- Wrap state updates in `act()` to batch React updates
- Use `waitFor()` for async state changes
- Mock external API calls and dependencies
- Test initial state, loading states, and error states

### Accessibility Testing

**Pattern**: Verify semantic HTML and ARIA attributes

```typescript
describe('Accessibility', () => {
  it('uses semantic HTML with label element', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toggle checked={false} onChange={onChange} label="Accessible toggle" />
    );

    const label = container.querySelector('label');
    expect(label).toBeInTheDocument();
    expect(screen.getByText('Accessible toggle')).toBeInTheDocument();
  });

  it('provides proper semantic structure', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toggle checked={true} onChange={onChange} label="Click me" />
    );

    const labelText = screen.getByText('Click me');
    const label = labelText.closest('label');
    const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');

    expect(label).toContainElement(toggleSwitch);
  });
});
```

## Mocking Strategies

### Module Mocking

Mock entire modules at the top of test files:

```typescript
// Mock external API
vi.mock('../api', () => ({
  uploadWasm: vi.fn(),
  callHook: vi.fn(),
}));

// Access mocked functions with type safety
const mockUploadWasm = vi.mocked(api.uploadWasm);
mockUploadWasm.mockResolvedValue('result');
```

### Function Mocking

Create mock functions for callbacks:

```typescript
const mockOnChange = vi.fn();
const mockOnClick = vi.fn();

// Render with mocks
render(<Component onChange={mockOnChange} onClick={mockOnClick} />);

// Verify calls
expect(mockOnChange).toHaveBeenCalledWith(expectedValue);
expect(mockOnChange).toHaveBeenCalledTimes(1);
expect(mockOnClick).not.toHaveBeenCalled();
```

### Promise Mocking

Mock async operations:

```typescript
// Resolved promise
mockUploadWasm.mockResolvedValue('success');

// Rejected promise
mockUploadWasm.mockRejectedValue(new Error('Failed'));

// Multiple calls with different results
mockUploadWasm
  .mockResolvedValueOnce('first')
  .mockResolvedValueOnce('second')
  .mockRejectedValueOnce(new Error('third fails'));
```

### File System Mocking

Mock Node.js fs operations:

```typescript
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

// In tests
vi.mocked(fs.readFile).mockResolvedValue("file content");
vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
```

### Cleaning Up Mocks

```typescript
beforeEach(() => {
  vi.clearAllMocks();  // Clear call history
});

afterEach(() => {
  vi.restoreAllMocks();  // Restore original implementation
});
```

## Coverage Expectations

### Target Coverage

Aim for high coverage on critical paths:

- **Utilities**: 90%+ coverage (pure functions are easy to test)
- **Components**: 80%+ coverage (focus on user interactions)
- **Hooks**: 85%+ coverage (test all state changes)
- **Integration code**: 70%+ coverage (focus on main flows)

### What to Cover

**Must Cover**:
- All public APIs and exported functions
- User-facing features and interactions
- Error handling and edge cases
- State changes and side effects

**Can Skip**:
- Type definitions (`.d.ts` files)
- Entry points (`main.tsx`, `server.ts`)
- Third-party library wrappers (unless adding logic)
- Trivial getters/setters

### Coverage Reports

Generate coverage reports:

```bash
# Backend coverage
vitest run --coverage

# Frontend coverage
cd frontend && vitest run --coverage

# View HTML reports
open coverage/index.html
open frontend/coverage/index.html
```

## Common Pitfalls to Avoid

### 1. Not Awaiting Async Operations

**Problem**:
```typescript
// ❌ Bad: Not awaiting user events
it('should call onChange', () => {
  const user = userEvent.setup();
  user.click(button);  // Missing await!
  expect(onChange).toHaveBeenCalled();  // Fails
});
```

**Solution**:
```typescript
// ✅ Good: Await user events and state updates
it('should call onChange', async () => {
  const user = userEvent.setup();
  await user.click(button);
  expect(onChange).toHaveBeenCalled();
});
```

### 2. Not Wrapping State Updates in act()

**Problem**:
```typescript
// ❌ Bad: State update without act()
it('should update state', () => {
  const { result } = renderHook(() => useWasm());
  result.current.loadWasm(file);  // Missing act()
  expect(result.current.loading).toBe(true);  // May fail
});
```

**Solution**:
```typescript
// ✅ Good: Wrap in act()
it('should update state', async () => {
  const { result } = renderHook(() => useWasm());
  await act(async () => {
    await result.current.loadWasm(file);
  });
  expect(result.current.loading).toBe(false);
});
```

### 3. Not Cleaning Up Mocks

**Problem**:
```typescript
// ❌ Bad: Mock state leaks between tests
it('test 1', () => {
  mockFn.mockReturnValue('value1');
  // test code
});

it('test 2', () => {
  // mockFn still has previous mock!
});
```

**Solution**:
```typescript
// ✅ Good: Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

### 4. Testing Implementation Details

**Problem**:
```typescript
// ❌ Bad: Testing internal state/class names
expect(component.state.count).toBe(1);
expect(button.className).toBe('button-primary');
```

**Solution**:
```typescript
// ✅ Good: Test behavior and output
expect(screen.getByText('Count: 1')).toBeInTheDocument();
expect(button).toHaveStyle({ backgroundColor: 'blue' });
```

### 5. Overly Specific Selectors

**Problem**:
```typescript
// ❌ Bad: Fragile CSS module class selection
const button = container.querySelector('.Toggle_button__abc123');
```

**Solution**:
```typescript
// ✅ Good: Use attribute or partial class match
const button = container.querySelector('[class*="button"]');
// Or use accessible queries
const button = screen.getByRole('button', { name: 'Toggle' });
```

### 6. Not Testing Error Paths

**Problem**:
```typescript
// ❌ Bad: Only testing success case
it('loads WASM file', async () => {
  mockUpload.mockResolvedValue('success');
  await loadWasm(file);
  expect(result).toBe('success');
});
```

**Solution**:
```typescript
// ✅ Good: Test both success and failure
it('loads WASM file successfully', async () => {
  mockUpload.mockResolvedValue('success');
  await loadWasm(file);
  expect(result).toBe('success');
});

it('handles upload errors', async () => {
  mockUpload.mockRejectedValue(new Error('Failed'));
  await loadWasm(file);
  expect(error).toBe('Failed');
});
```

### 7. Using waitFor Unnecessarily

**Problem**:
```typescript
// ❌ Bad: waitFor for synchronous checks
await waitFor(() => {
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

**Solution**:
```typescript
// ✅ Good: Direct assertion for synchronous renders
expect(screen.getByText('Hello')).toBeInTheDocument();

// Use waitFor only for async changes
await waitFor(() => {
  expect(result.current.loading).toBe(false);
});
```

## Quick Reference

### Essential Testing Library Queries

- `screen.getByText()` - Find by text content
- `screen.getByRole()` - Find by ARIA role (most accessible)
- `screen.getByPlaceholderText()` - Find inputs by placeholder
- `screen.getByLabelText()` - Find inputs by label
- `screen.getAllBy*()` - Get array of matching elements
- `screen.queryBy*()` - Returns null if not found (no error)
- `screen.findBy*()` - Async query with automatic waiting

### Essential Vitest Matchers

- `expect(value).toBe(expected)` - Strict equality (===)
- `expect(value).toEqual(expected)` - Deep equality (objects/arrays)
- `expect(value).toBeGreaterThan(n)` - Numeric comparison
- `expect(value).toContain(item)` - Array/string contains
- `expect(element).toBeInTheDocument()` - DOM presence
- `expect(element).toHaveValue(value)` - Input value
- `expect(element).toHaveAttribute(attr, value)` - HTML attribute
- `expect(mockFn).toHaveBeenCalled()` - Function called
- `expect(mockFn).toHaveBeenCalledWith(arg)` - Called with specific args
- `expect(mockFn).toHaveBeenCalledTimes(n)` - Called n times

### Test File Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentUnderTest } from './ComponentUnderTest';

describe('ComponentUnderTest', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnChange = vi.fn();
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<ComponentUnderTest onChange={mockOnChange} />);
      expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should handle user clicks', async () => {
      const user = userEvent.setup();
      render(<ComponentUnderTest onChange={mockOnChange} />);

      await user.click(screen.getByRole('button'));

      expect(mockOnChange).toHaveBeenCalledWith('expected value');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      render(<ComponentUnderTest value="" onChange={mockOnChange} />);
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});
```

---

## Related Documentation

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Test setup and running tests
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - When to write tests during development
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
