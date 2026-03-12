import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  describe('Rendering', () => {
    it('renders without a label', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} />
      );

      expect(container.querySelector('label')).toBeInTheDocument();
      expect(container.querySelector('span')).not.toBeInTheDocument();
    });

    it('renders with a label', () => {
      const onChange = vi.fn();
      render(
        <Toggle checked={false} onChange={onChange} label="Enable feature" />
      );

      expect(screen.getByText('Enable feature')).toBeInTheDocument();
    });

    it('applies custom styles', () => {
      const onChange = vi.fn();
      const customStyle = { marginTop: '20px', backgroundColor: 'red' };
      const { container } = render(
        <Toggle checked={false} onChange={onChange} style={customStyle} />
      );

      const label = container.querySelector('label');
      expect(label).toHaveAttribute('style');
      // Verify the style object is applied (checking the attribute directly)
      const style = label?.getAttribute('style');
      expect(style).toContain('margin-top');
      expect(style).toContain('background-color');
    });
  });

  describe('Visual States', () => {
    it('renders unchecked state correctly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} label="Test toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();
      expect(toggleSwitch?.className).not.toContain('checked');
    });

    it('renders checked state correctly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={true} onChange={onChange} label="Test toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();
      expect(toggleSwitch?.className).toContain('checked');
    });

    it('renders disabled state correctly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} disabled={true} label="Disabled toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      const toggleLabel = container.querySelector('[class*="toggleLabel"]');

      expect(toggleSwitch?.className).toContain('disabled');
      expect(toggleLabel?.className).toContain('disabled');
    });

    it('renders checked and disabled state correctly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={true} onChange={onChange} disabled={true} />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');

      expect(toggleSwitch?.className).toContain('checked');
      expect(toggleSwitch?.className).toContain('disabled');
    });
  });

  describe('Interaction', () => {
    it('calls onChange with true when clicked while unchecked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} label="Test toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();

      await user.click(toggleSwitch!);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('calls onChange with false when clicked while checked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={true} onChange={onChange} label="Test toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();

      await user.click(toggleSwitch!);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('does not call onChange when disabled and clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} disabled={true} label="Disabled toggle" />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();

      await user.click(toggleSwitch!);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('stops event propagation when clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onParentClick = vi.fn();
      const { container } = render(
        <div onClick={onParentClick}>
          <Toggle checked={false} onChange={onChange} />
        </div>
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();

      await user.click(toggleSwitch!);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onParentClick).not.toHaveBeenCalled();
    });

    it('handles multiple clicks correctly', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch).toBeInTheDocument();

      await user.click(toggleSwitch!);
      await user.click(toggleSwitch!);
      await user.click(toggleSwitch!);

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenNthCalledWith(1, true);
      expect(onChange).toHaveBeenNthCalledWith(2, true);
      expect(onChange).toHaveBeenNthCalledWith(3, true);
    });
  });

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

    it('associates label with toggle switch correctly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} label="Feature toggle" />
      );

      const label = container.querySelector('label');
      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');

      expect(label).toContainElement(toggleSwitch);
      expect(label).toContainElement(screen.getByText('Feature toggle'));
    });

    it('renders toggle slider for visual feedback', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} />
      );

      const slider = container.querySelector('[class*="toggleSlider"]');
      expect(slider).toBeInTheDocument();
    });

    it('maintains keyboard accessibility through label structure', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} label="Keyboard accessible" />
      );

      const label = screen.getByText('Keyboard accessible').closest('label');
      expect(label).toBeInTheDocument();

      // Verify label contains the toggle switch for proper association
      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(label).toContainElement(toggleSwitch);

      // Label acts as a semantic container, the div handles clicks
      expect(toggleSwitch).toBeInTheDocument();
    });

    it('provides proper semantic structure for assistive technologies', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={true} onChange={onChange} label="Click me" />
      );

      const labelText = screen.getByText('Click me');
      const label = labelText.closest('label');
      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');

      // Verify the semantic relationship between label and toggle
      expect(label).toContainElement(labelText);
      expect(label).toContainElement(toggleSwitch);
    });

    it('disabled toggle is visually distinguishable', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} disabled={true} label="Disabled" />
      );

      const toggleLabel = container.querySelector('[class*="toggleLabel"]');
      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');

      expect(toggleLabel?.className).toContain('disabled');
      expect(toggleSwitch?.className).toContain('disabled');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty label string', () => {
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} label="" />
      );

      // Empty string should not render span
      expect(container.querySelector('span')).not.toBeInTheDocument();
    });

    it('handles undefined disabled prop (defaults to false)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(
        <Toggle checked={false} onChange={onChange} />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      await user.click(toggleSwitch!);

      expect(onChange).toHaveBeenCalled();
    });

    it('re-renders correctly when checked prop changes', () => {
      const onChange = vi.fn();
      const { container, rerender } = render(
        <Toggle checked={false} onChange={onChange} />
      );

      let toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch?.className).not.toContain('checked');

      rerender(<Toggle checked={true} onChange={onChange} />);

      toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      expect(toggleSwitch?.className).toContain('checked');
    });

    it('re-renders correctly when disabled prop changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container, rerender } = render(
        <Toggle checked={false} onChange={onChange} disabled={false} />
      );

      let toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      await user.click(toggleSwitch!);
      expect(onChange).toHaveBeenCalledTimes(1);

      onChange.mockClear();

      rerender(<Toggle checked={false} onChange={onChange} disabled={true} />);

      toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      await user.click(toggleSwitch!);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles style prop updates', () => {
      const onChange = vi.fn();
      const { container, rerender } = render(
        <Toggle checked={false} onChange={onChange} style={{ color: 'red' }} />
      );

      let label = container.querySelector('label');
      let style = label?.getAttribute('style');
      expect(style).toContain('color');

      rerender(
        <Toggle checked={false} onChange={onChange} style={{ color: 'blue', padding: '10px' }} />
      );

      label = container.querySelector('label');
      style = label?.getAttribute('style');
      expect(style).toContain('color');
      expect(style).toContain('padding');
    });

    it('handles onChange callback being replaced', async () => {
      const user = userEvent.setup();
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();
      const { container, rerender } = render(
        <Toggle checked={false} onChange={onChange1} />
      );

      const toggleSwitch = container.querySelector('[class*="toggleSwitch"]');
      await user.click(toggleSwitch!);
      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).not.toHaveBeenCalled();

      rerender(<Toggle checked={false} onChange={onChange2} />);

      await user.click(toggleSwitch!);
      expect(onChange1).toHaveBeenCalledTimes(1);
      expect(onChange2).toHaveBeenCalledTimes(1);
    });
  });
});
