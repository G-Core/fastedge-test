import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictionaryInput } from './DictionaryInput';

describe('DictionaryInput', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnChange = vi.fn();
  });

  describe('Initial rendering', () => {
    it('should render with one empty row by default', () => {
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      expect(keyInputs).toHaveLength(1);
      expect(valueInputs).toHaveLength(1);
      expect(keyInputs[0]).toHaveValue('');
      expect(valueInputs[0]).toHaveValue('');
    });

    it('should render with provided values', () => {
      const value = { 'Content-Type': 'application/json', Accept: 'text/html' };
      render(<DictionaryInput value={value} onChange={mockOnChange} />);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      // 2 rows with data + 1 empty row at the end
      expect(keyInputs).toHaveLength(3);
      expect(valueInputs).toHaveLength(3);

      expect(keyInputs[0]).toHaveValue('Content-Type');
      expect(valueInputs[0]).toHaveValue('application/json');
      expect(keyInputs[1]).toHaveValue('Accept');
      expect(valueInputs[1]).toHaveValue('text/html');
      expect(keyInputs[2]).toHaveValue('');
      expect(valueInputs[2]).toHaveValue('');
    });

    it('should render with custom placeholders', () => {
      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          keyPlaceholder="Property Name"
          valuePlaceholder="Property Value"
        />
      );

      expect(screen.getByPlaceholderText('Property Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Property Value')).toBeInTheDocument();
    });

    it('should render header labels matching placeholders', () => {
      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          keyPlaceholder="Header Name"
          valuePlaceholder="Header Value"
        />
      );

      expect(screen.getByText('Header Name')).toBeInTheDocument();
      expect(screen.getByText('Header Value')).toBeInTheDocument();
    });
  });

  describe('Adding rows', () => {
    it('should auto-add new row when typing in key field of last row', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      expect(keyInputs).toHaveLength(1);

      await user.type(keyInputs[0], 'NewKey');

      const updatedKeyInputs = screen.getAllByPlaceholderText('Key');
      expect(updatedKeyInputs).toHaveLength(2);
      expect(updatedKeyInputs[0]).toHaveValue('NewKey');
      expect(updatedKeyInputs[1]).toHaveValue('');
    });

    it('should auto-add new row when typing in value field of last row', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const valueInputs = screen.getAllByPlaceholderText('Value');
      expect(valueInputs).toHaveLength(1);

      await user.type(valueInputs[0], 'NewValue');

      const updatedValueInputs = screen.getAllByPlaceholderText('Value');
      expect(updatedValueInputs).toHaveLength(2);
      expect(updatedValueInputs[0]).toHaveValue('NewValue');
      expect(updatedValueInputs[1]).toHaveValue('');
    });

    it('should auto-add new row when both key and value are entered', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      await user.type(keyInputs[0], 'TestKey');
      await user.type(valueInputs[0], 'TestValue');

      const updatedKeyInputs = screen.getAllByPlaceholderText('Key');
      expect(updatedKeyInputs).toHaveLength(2);
    });

    it('should not add extra rows in disableDelete mode', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      expect(keyInputs).toHaveLength(1); // Only the initial row

      await user.clear(keyInputs[0]);
      await user.type(keyInputs[0], 'NewKey');

      const updatedKeyInputs = screen.getAllByPlaceholderText('Key');
      expect(updatedKeyInputs).toHaveLength(1); // Still only one row
    });
  });

  describe('Removing rows', () => {
    it('should remove row when delete button is clicked', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
        />
      );

      const deleteButtons = screen.getAllByTitle('Delete row');
      // Both rows with data should have delete buttons (not the empty row)
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(deleteButtons[0]);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      expect(keyInputs).toHaveLength(2); // 1 remaining row + 1 empty row

      // Check that the deleted key is no longer present
      const keyValues = Array.from(keyInputs).map(input => input.getAttribute('value'));
      expect(keyValues).not.toContain('key1');
      expect(keyValues).toContain('key2');
    });

    it('should disable delete button on last empty row', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      // There should be 2 rows: 1 with data and 1 empty
      expect(keyInputs).toHaveLength(2);

      // Find the last row (empty row)
      const lastInput = keyInputs[keyInputs.length - 1];
      expect(lastInput).toHaveValue('');

      // The last empty row should have a disabled delete button
      const deleteButtons = screen.getAllByTitle('Delete row');
      expect(deleteButtons).toHaveLength(2);

      // The last delete button should be disabled since it's on an empty row
      expect(deleteButtons[deleteButtons.length - 1]).toBeDisabled();
    });

    it('should keep at least one row when deleting all', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const deleteButtons = screen.getAllByTitle('Delete row');
      fireEvent.click(deleteButtons[0]);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      // Should have at least one row remaining
      expect(keyInputs.length).toBeGreaterThanOrEqual(1);

      // All remaining rows should be empty
      const allEmpty = Array.from(keyInputs).every(input => input.getAttribute('value') === '');
      expect(allEmpty).toBe(true);
    });

    it('should disable delete button when only one row exists', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      // Should start with 2 rows: 1 with data + 1 empty
      expect(keyInputs).toHaveLength(2);

      const deleteButtons = screen.getAllByTitle('Delete row');
      fireEvent.click(deleteButtons[0]);

      // After deletion, check if remaining delete buttons are disabled
      const remainingDeleteButtons = screen.queryAllByTitle('Delete row');
      // Should have fewer delete buttons after deletion, or they should be disabled
      if (remainingDeleteButtons.length > 0) {
        // If there are still delete buttons, they should be disabled when only one row remains
        const nonEmptyRows = screen.getAllByPlaceholderText('Key').filter(
          input => input.getAttribute('value') !== ''
        );
        if (nonEmptyRows.length <= 1) {
          remainingDeleteButtons.forEach(btn => {
            expect(btn).toBeDisabled();
          });
        }
      }
    });

    it('should not show delete buttons in disableDelete mode', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const deleteButtons = screen.queryAllByTitle('Delete row');
      expect(deleteButtons).toHaveLength(0);
    });
  });

  describe('Enable/disable checkboxes', () => {
    it('should render checkboxes for all rows', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      // 2 rows with data + 1 empty row
      expect(checkboxes).toHaveLength(3);
    });

    it('should have checkboxes checked for enabled rows', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).toBeChecked();
    });

    it('should disable checkbox for empty rows', () => {
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('should enable checkbox when row has a key', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();

      const keyInput = screen.getByPlaceholderText('Key');
      await user.type(keyInput, 'TestKey');

      expect(checkbox).not.toBeDisabled();
    });

    it('should toggle checkbox and update enabled state', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const checkbox = screen.getAllByRole('checkbox')[0];
      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it('should reduce opacity for disabled rows', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const keyInput = screen.getAllByPlaceholderText('Key')[0];
      const valueInput = screen.getAllByPlaceholderText('Value')[0];

      // Initially enabled, opacity should be 1
      expect(keyInput).toHaveStyle({ opacity: '1' });
      expect(valueInput).toHaveStyle({ opacity: '1' });

      const checkbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(checkbox);

      // After disabling, opacity should be 0.5
      expect(keyInput).toHaveStyle({ opacity: '0.5' });
      expect(valueInput).toHaveStyle({ opacity: '0.5' });
    });
  });

  describe('Default values', () => {
    it('should render default values with string format', () => {
      const defaultValues = {
        'User-Agent': 'TestAgent/1.0',
        'Accept-Encoding': 'gzip',
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      expect(keyInputs[0]).toHaveValue('User-Agent');
      expect(valueInputs[0]).toHaveValue('TestAgent/1.0');
      expect(keyInputs[1]).toHaveValue('Accept-Encoding');
      expect(valueInputs[1]).toHaveValue('gzip');
    });

    it('should render default values with object format', () => {
      const defaultValues = {
        'Content-Type': {
          value: 'application/json',
          enabled: true,
        },
        Authorization: {
          value: 'Bearer token',
          enabled: false,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');
      const checkboxes = screen.getAllByRole('checkbox');

      expect(keyInputs[0]).toHaveValue('Content-Type');
      expect(valueInputs[0]).toHaveValue('application/json');
      expect(checkboxes[0]).toBeChecked();

      expect(keyInputs[1]).toHaveValue('Authorization');
      expect(valueInputs[1]).toHaveValue('Bearer token');
      expect(checkboxes[1]).not.toBeChecked();
    });

    it('should default enabled to true when not specified in object format', () => {
      const defaultValues = {
        TestKey: {
          value: 'TestValue',
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked();
    });

    it('should merge value prop with default values (value prop takes precedence)', () => {
      const defaultValues = {
        key1: 'default1',
        key2: 'default2',
      };
      const value = {
        key2: 'override2',
        key3: 'new3',
      };

      render(
        <DictionaryInput
          value={value}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      // Should have key1 (from defaults), key2 (overridden), key3 (new), and empty row
      expect(keyInputs).toHaveLength(4);

      const key1Index = Array.from(keyInputs).findIndex(input => input.getAttribute('value') === 'key1');
      const key2Index = Array.from(keyInputs).findIndex(input => input.getAttribute('value') === 'key2');
      const key3Index = Array.from(keyInputs).findIndex(input => input.getAttribute('value') === 'key3');

      expect(valueInputs[key1Index]).toHaveValue('default1');
      expect(valueInputs[key2Index]).toHaveValue('override2'); // Value prop overrides default
      expect(valueInputs[key3Index]).toHaveValue('new3');
    });

    it('should use per-row placeholder from default values', () => {
      const defaultValues = {
        customKey: {
          value: '',
          placeholder: 'Enter custom value here',
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          valuePlaceholder="Value"
          defaultValues={defaultValues}
        />
      );

      const customValueInput = screen.getByPlaceholderText('Enter custom value here');
      expect(customValueInput).toBeInTheDocument();
    });
  });

  describe('Read-only rows', () => {
    it('should render read-only rows that cannot be edited', () => {
      const defaultValues = {
        readOnlyKey: {
          value: 'Cannot edit this',
          readOnly: true,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      expect(keyInputs[0]).toHaveAttribute('readonly');
      expect(valueInputs[0]).toHaveAttribute('readonly');
    });

    it('should not allow focus on read-only rows', () => {
      const defaultValues = {
        readOnlyKey: {
          value: 'Cannot focus',
          readOnly: true,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      expect(keyInputs[0]).toHaveAttribute('tabindex', '-1');
      expect(valueInputs[0]).toHaveAttribute('tabindex', '-1');
    });

    it('should not show delete button for read-only rows', () => {
      const defaultValues = {
        readOnlyKey: {
          value: 'Cannot delete',
          readOnly: true,
        },
        normalKey: 'Can delete',
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const rows = screen.getAllByPlaceholderText('Key').map(input =>
        input.closest('[class*="row"]')
      );

      // Read-only row should not have delete button
      const readOnlyRow = rows[0];
      const readOnlyDeleteButton = readOnlyRow ? within(readOnlyRow).queryByTitle('Delete row') : null;
      expect(readOnlyDeleteButton).toBeNull();

      // Normal row should have delete button
      const normalRow = rows[1];
      const normalDeleteButton = normalRow ? within(normalRow).queryByTitle('Delete row') : null;
      expect(normalDeleteButton).not.toBeNull();
    });

    it('should reduce opacity for read-only rows', () => {
      const defaultValues = {
        readOnlyKey: {
          value: 'Read only value',
          readOnly: true,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInput = screen.getAllByPlaceholderText('Key')[0];
      const valueInput = screen.getAllByPlaceholderText('Value')[0];

      expect(keyInput).toHaveStyle({ opacity: '0.5' });
      expect(valueInput).toHaveStyle({ opacity: '0.5' });
    });

    it('should disable checkbox for read-only rows', () => {
      const defaultValues = {
        readOnlyKey: {
          value: 'Read only value',
          readOnly: true,
          enabled: true,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const checkbox = screen.getAllByRole('checkbox')[0];
      expect(checkbox).toBeDisabled();
    });

    it('should not allow editing read-only rows via user input', async () => {
      const user = userEvent.setup();
      const defaultValues = {
        readOnlyKey: {
          value: 'Original value',
          readOnly: true,
        },
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          defaultValues={defaultValues}
        />
      );

      const keyInput = screen.getAllByPlaceholderText('Key')[0];
      const valueInput = screen.getAllByPlaceholderText('Value')[0];

      // Attempt to type (should not work due to readOnly)
      await user.click(keyInput);
      await user.type(keyInput, 'NewText');

      await user.click(valueInput);
      await user.type(valueInput, 'NewValue');

      // Values should remain unchanged
      expect(keyInput).toHaveValue('readOnlyKey');
      expect(valueInput).toHaveValue('Original value');
    });
  });

  describe('onChange callback', () => {
    it('should call onChange with correct format when adding a key-value pair', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'TestKey');
      await user.type(valueInput, 'TestValue');

      expect(mockOnChange).toHaveBeenLastCalledWith({ TestKey: 'TestValue' });
    });

    it('should call onChange with trimmed keys and values', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, '  SpacedKey  ');
      await user.type(valueInput, '  SpacedValue  ');

      expect(mockOnChange).toHaveBeenLastCalledWith({ SpacedKey: 'SpacedValue' });
    });

    it('should call onChange when toggling checkbox', async () => {
      render(
        <DictionaryInput
          value={{ TestKey: 'TestValue' }}
          onChange={mockOnChange}
        />
      );

      const checkbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(checkbox);

      // When disabled, the key should not be in the output
      expect(mockOnChange).toHaveBeenLastCalledWith({});

      fireEvent.click(checkbox);

      // When re-enabled, the key should be back
      expect(mockOnChange).toHaveBeenLastCalledWith({ TestKey: 'TestValue' });
    });

    it('should call onChange when deleting a row', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
        />
      );

      const deleteButtons = screen.getAllByTitle('Delete row');
      fireEvent.click(deleteButtons[0]);

      expect(mockOnChange).toHaveBeenLastCalledWith({ key2: 'value2' });
    });

    it('should not include disabled rows in onChange output', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ enabledKey: 'enabledValue' }}
          onChange={mockOnChange}
        />
      );

      // Disable the first row
      const checkbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(checkbox);

      expect(mockOnChange).toHaveBeenLastCalledWith({});

      // Add a new enabled row
      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      await user.type(keyInputs[keyInputs.length - 1], 'NewKey');
      await user.type(valueInputs[valueInputs.length - 1], 'NewValue');

      // Should only include the new enabled key
      expect(mockOnChange).toHaveBeenLastCalledWith({ NewKey: 'NewValue' });
    });

    it('should not include rows with empty keys in onChange output', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const valueInput = screen.getByPlaceholderText('Value');
      await user.type(valueInput, 'ValueWithoutKey');

      // Should not call onChange with this row since key is empty
      expect(mockOnChange).toHaveBeenLastCalledWith({});
    });

    it('should handle multiple rows correctly in onChange', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      // Add second row
      await user.type(keyInputs[1], 'key2');
      await user.type(valueInputs[1], 'value2');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        key1: 'value1',
        key2: 'value2',
      });
    });
  });

  describe('Placeholder behavior', () => {
    it('should show global placeholder for all value fields by default', () => {
      render(
        <DictionaryInput
          value={{ key1: '', key2: '' }}
          onChange={mockOnChange}
          valuePlaceholder="Global Placeholder"
        />
      );

      const valueInputs = screen.getAllByPlaceholderText('Global Placeholder');
      expect(valueInputs.length).toBeGreaterThan(0);
    });

    it('should override global placeholder with per-row placeholder', () => {
      const defaultValues = {
        key1: {
          value: '',
          placeholder: 'Custom Placeholder',
        },
        key2: 'value2',
      };

      render(
        <DictionaryInput
          value={{}}
          onChange={mockOnChange}
          valuePlaceholder="Global Placeholder"
          defaultValues={defaultValues}
        />
      );

      expect(screen.getByPlaceholderText('Custom Placeholder')).toBeInTheDocument();

      // The second row should use the global placeholder
      const globalPlaceholders = screen.getAllByPlaceholderText('Global Placeholder');
      expect(globalPlaceholders.length).toBeGreaterThan(0);
    });

    it('should use global key placeholder for all key fields', () => {
      render(
        <DictionaryInput
          value={{ key1: '', key2: '' }}
          onChange={mockOnChange}
          keyPlaceholder="Custom Key"
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Custom Key');
      expect(keyInputs.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid typing without losing data', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'FastKey');
      await user.type(valueInput, 'FastValue');

      expect(keyInput).toHaveValue('FastKey');
      expect(valueInput).toHaveValue('FastValue');
    });

    it('should handle special characters in keys and values', async () => {
      const user = userEvent.setup();
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'X-Custom-Header!@#');
      await user.type(valueInput, 'Value with $pecial & characters');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        'X-Custom-Header!@#': 'Value with $pecial & characters',
      });
    });

    it('should handle empty value prop', () => {
      render(<DictionaryInput value={{}} onChange={mockOnChange} />);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      expect(keyInputs).toHaveLength(1);
      expect(keyInputs[0]).toHaveValue('');
    });

    it('should handle updating existing values', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ existingKey: 'oldValue' }}
          onChange={mockOnChange}
        />
      );

      const valueInput = screen.getAllByPlaceholderText('Value')[0];
      await user.clear(valueInput);
      await user.type(valueInput, 'newValue');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        existingKey: 'newValue',
      });
    });

    it('should handle clearing a key', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const keyInput = screen.getAllByPlaceholderText('Key')[0];
      await user.clear(keyInput);

      // When key is cleared, the row should not be included in onChange
      expect(mockOnChange).toHaveBeenLastCalledWith({});
    });

    it('should sync with external value changes', () => {
      const { rerender } = render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      const valueInputs = screen.getAllByPlaceholderText('Value');
      expect(valueInputs[0]).toHaveValue('value1');

      // Update value prop externally
      rerender(
        <DictionaryInput
          value={{ key1: 'updatedValue' }}
          onChange={mockOnChange}
        />
      );

      const updatedValueInputs = screen.getAllByPlaceholderText('Value');
      expect(updatedValueInputs[0]).toHaveValue('updatedValue');
    });

    it('should add new keys from external value changes', () => {
      const { rerender } = render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(2); // 1 data + 1 empty

      // Add new key externally
      rerender(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(3); // 2 data + 1 empty
    });
  });

  describe('disableDelete mode', () => {
    it('should not show any delete buttons in disableDelete mode', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const deleteButtons = screen.queryAllByTitle('Delete row');
      expect(deleteButtons).toHaveLength(0);
    });

    it('should not auto-add empty row in disableDelete mode', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1', key2: 'value2' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const keyInputs = screen.getAllByPlaceholderText('Key');
      // Should only have the 2 rows with data, no empty row
      expect(keyInputs).toHaveLength(2);
      expect(keyInputs[0]).toHaveValue('key1');
      expect(keyInputs[1]).toHaveValue('key2');
    });

    it('should allow editing existing rows in disableDelete mode', async () => {
      const user = userEvent.setup();
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const valueInput = screen.getByPlaceholderText('Value');
      await user.clear(valueInput);
      await user.type(valueInput, 'newValue');

      expect(mockOnChange).toHaveBeenLastCalledWith({ key1: 'newValue' });
    });

    it('should allow toggling checkboxes in disableDelete mode', () => {
      render(
        <DictionaryInput
          value={{ key1: 'value1' }}
          onChange={mockOnChange}
          disableDelete={true}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
      expect(mockOnChange).toHaveBeenLastCalledWith({});
    });
  });
});
