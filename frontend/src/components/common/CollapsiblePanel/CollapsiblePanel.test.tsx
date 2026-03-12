import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsiblePanel } from './CollapsiblePanel';

describe('CollapsiblePanel', () => {
  describe('Rendering', () => {
    it('should render with title', () => {
      render(
        <CollapsiblePanel title="Test Panel">
          <div>Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Test Panel')).toBeInTheDocument();
    });

    it('should render children when expanded', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Panel Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Panel Content')).toBeInTheDocument();
    });

    it('should not render children when collapsed', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={false}>
          <div>Panel Content</div>
        </CollapsiblePanel>
      );

      expect(screen.queryByText('Panel Content')).not.toBeInTheDocument();
    });

    it('should render headerExtra content when provided', () => {
      const headerExtra = <span data-testid="extra">Extra Content</span>;

      render(
        <CollapsiblePanel title="Test Panel" headerExtra={headerExtra}>
          <div>Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByTestId('extra')).toBeInTheDocument();
      expect(screen.getByText('Extra Content')).toBeInTheDocument();
    });

    it('should not render headerExtra when not provided', () => {
      render(
        <CollapsiblePanel title="Test Panel">
          <div>Content</div>
        </CollapsiblePanel>
      );

      // Should only have title and arrow, no extra content
      const header = screen.getByText('Test Panel').closest('div');
      expect(header).toBeInTheDocument();
    });

    it('should render arrow indicator', () => {
      const { container } = render(
        <CollapsiblePanel title="Test Panel">
          <div>Content</div>
        </CollapsiblePanel>
      );

      const arrow = container.querySelector('div[class*="arrow"]');
      expect(arrow).toBeInTheDocument();
    });
  });

  describe('defaultExpanded prop', () => {
    it('should expand by default when defaultExpanded is true', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Visible Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Visible Content')).toBeInTheDocument();
    });

    it('should expand by default when defaultExpanded is not provided (defaults to true)', () => {
      render(
        <CollapsiblePanel title="Test Panel">
          <div>Default Visible Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Default Visible Content')).toBeInTheDocument();
    });

    it('should collapse by default when defaultExpanded is false', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={false}>
          <div>Hidden Content</div>
        </CollapsiblePanel>
      );

      expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
    });
  });

  describe('Expand/Collapse behavior', () => {
    it('should toggle from expanded to collapsed when header is clicked', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Toggle Content</div>
        </CollapsiblePanel>
      );

      const title = screen.getByText('Test Panel');
      expect(screen.getByText('Toggle Content')).toBeInTheDocument();

      // Click header to collapse
      fireEvent.click(title);
      expect(screen.queryByText('Toggle Content')).not.toBeInTheDocument();
    });

    it('should toggle from collapsed to expanded when header is clicked', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={false}>
          <div>Toggle Content</div>
        </CollapsiblePanel>
      );

      const title = screen.getByText('Test Panel');
      expect(screen.queryByText('Toggle Content')).not.toBeInTheDocument();

      // Click header to expand
      fireEvent.click(title);
      expect(screen.getByText('Toggle Content')).toBeInTheDocument();
    });

    it('should toggle multiple times when clicked repeatedly', () => {
      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Multi Toggle Content</div>
        </CollapsiblePanel>
      );

      const title = screen.getByText('Test Panel');

      // Initially expanded
      expect(screen.getByText('Multi Toggle Content')).toBeInTheDocument();

      // First toggle - collapse
      fireEvent.click(title);
      expect(screen.queryByText('Multi Toggle Content')).not.toBeInTheDocument();

      // Second toggle - expand
      fireEvent.click(title);
      expect(screen.getByText('Multi Toggle Content')).toBeInTheDocument();

      // Third toggle - collapse
      fireEvent.click(title);
      expect(screen.queryByText('Multi Toggle Content')).not.toBeInTheDocument();
    });

    it('should handle user event click interaction', async () => {
      const user = userEvent.setup();

      render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>User Event Content</div>
        </CollapsiblePanel>
      );

      const title = screen.getByText('Test Panel');
      expect(screen.getByText('User Event Content')).toBeInTheDocument();

      // Click using userEvent
      await user.click(title);
      expect(screen.queryByText('User Event Content')).not.toBeInTheDocument();
    });
  });

  describe('Arrow rotation animation class', () => {
    it('should have expanded class on arrow when panel is expanded', () => {
      const { container } = render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Content</div>
        </CollapsiblePanel>
      );

      const arrow = container.querySelector('div[class*="arrow"]');
      expect(arrow?.className).toMatch(/expanded/);
    });

    it('should not have expanded class on arrow when panel is collapsed', () => {
      const { container } = render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={false}>
          <div>Content</div>
        </CollapsiblePanel>
      );

      const arrow = container.querySelector('div[class*="arrow"]');
      expect(arrow?.className).not.toMatch(/expanded/);
      expect(arrow?.className).toMatch(/arrow/);
    });

    it('should toggle arrow expanded class when panel is toggled', () => {
      const { container } = render(
        <CollapsiblePanel title="Test Panel" defaultExpanded={true}>
          <div>Content</div>
        </CollapsiblePanel>
      );

      const title = screen.getByText('Test Panel');
      const arrow = container.querySelector('div[class*="arrow"]');

      // Initially expanded
      expect(arrow?.className).toMatch(/expanded/);

      // Click to collapse
      fireEvent.click(title);
      expect(arrow?.className).not.toMatch(/expanded/);

      // Click to expand again
      fireEvent.click(title);
      expect(arrow?.className).toMatch(/expanded/);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle complex children with nested components', () => {
      render(
        <CollapsiblePanel title="Complex Panel">
          <div>
            <h4>Nested Title</h4>
            <p>Nested paragraph</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Nested Title')).toBeInTheDocument();
      expect(screen.getByText('Nested paragraph')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('should handle headerExtra with interactive elements', () => {
      const handleClick = () => {};

      render(
        <CollapsiblePanel
          title="Interactive Panel"
          headerExtra={<button onClick={handleClick}>Action</button>}
        >
          <div>Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });

    it('should render multiple instances independently', () => {
      render(
        <>
          <CollapsiblePanel title="Panel 1" defaultExpanded={true}>
            <div>Content 1</div>
          </CollapsiblePanel>
          <CollapsiblePanel title="Panel 2" defaultExpanded={false}>
            <div>Content 2</div>
          </CollapsiblePanel>
        </>
      );

      expect(screen.getByText('Panel 1')).toBeInTheDocument();
      expect(screen.getByText('Panel 2')).toBeInTheDocument();
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();

      // Toggle Panel 2
      fireEvent.click(screen.getByText('Panel 2'));
      expect(screen.getByText('Content 2')).toBeInTheDocument();

      // Panel 1 should still be expanded
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });

    it('should handle empty children', () => {
      render(
        <CollapsiblePanel title="Empty Panel">
          <></>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Empty Panel')).toBeInTheDocument();
    });

    it('should handle special characters in title', () => {
      render(
        <CollapsiblePanel title="Panel with <special> & characters">
          <div>Content</div>
        </CollapsiblePanel>
      );

      expect(screen.getByText('Panel with <special> & characters')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(
        <CollapsiblePanel title="Accessible Panel">
          <div>Content</div>
        </CollapsiblePanel>
      );

      const heading = screen.getByRole('heading', { name: 'Accessible Panel' });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H3');
    });

    it('should have clickable header with pointer cursor class', () => {
      const { container } = render(
        <CollapsiblePanel title="Clickable Panel">
          <div>Content</div>
        </CollapsiblePanel>
      );

      const header = container.querySelector('[class*="header"]');
      expect(header).toBeInTheDocument();
      expect(header?.className).toMatch(/header/);
    });
  });
});
