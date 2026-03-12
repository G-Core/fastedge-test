import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../index';
import type { WebSocketStatus } from '../../types';

describe('UISlice', () => {
  beforeEach(() => {
    // Clear localStorage to start fresh
    window.localStorage.clear();

    // Reset store state before each test
    const { result } = renderHook(() => useAppStore());
    act(() => {
      // Reset to defaults
      result.current.setActiveHookTab('request_headers');
      result.current.setActiveSubView('logs');
      result.current.setWsStatus({
        connected: false,
        reconnecting: false,
        clientCount: 0,
        error: null,
      });
      // Clear all expanded panels
      Object.keys(result.current.expandedPanels).forEach(panel => {
        if (result.current.expandedPanels[panel]) {
          result.current.togglePanel(panel);
        }
      });
      result.current.markClean();
    });
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const { result } = renderHook(() => useAppStore());

      expect(result.current.activeHookTab).toBe('request_headers');
      expect(result.current.activeSubView).toBe('logs');
      expect(result.current.expandedPanels).toBeDefined();
      expect(result.current.wsStatus).toEqual({
        connected: false,
        reconnecting: false,
        clientCount: 0,
        error: null,
      });
    });
  });

  describe('setActiveHookTab', () => {
    it('should update active hook tab', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setActiveHookTab('response_headers');
      });

      expect(result.current.activeHookTab).toBe('response_headers');
    });

    it('should NOT mark dirty when tab is changed (ephemeral)', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setActiveHookTab('request_body');
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should handle various hook names', () => {
      const { result } = renderHook(() => useAppStore());
      const hooks = [
        'request_headers',
        'request_body',
        'response_headers',
        'response_body',
        'custom_hook',
      ];

      hooks.forEach(hook => {
        act(() => {
          result.current.setActiveHookTab(hook);
        });
        expect(result.current.activeHookTab).toBe(hook);
      });
    });
  });

  describe('setActiveSubView', () => {
    it('should update active sub-view to logs', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setActiveSubView('logs');
      });

      expect(result.current.activeSubView).toBe('logs');
    });

    it('should update active sub-view to inputs', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setActiveSubView('inputs');
      });

      expect(result.current.activeSubView).toBe('inputs');
    });

    it('should update active sub-view to outputs', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setActiveSubView('outputs');
      });

      expect(result.current.activeSubView).toBe('outputs');
    });

    it('should NOT mark dirty when sub-view is changed (ephemeral)', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setActiveSubView('inputs');
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should switch between all sub-views', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setActiveSubView('logs');
      });
      expect(result.current.activeSubView).toBe('logs');

      act(() => {
        result.current.setActiveSubView('inputs');
      });
      expect(result.current.activeSubView).toBe('inputs');

      act(() => {
        result.current.setActiveSubView('outputs');
      });
      expect(result.current.activeSubView).toBe('outputs');
    });
  });

  describe('togglePanel', () => {
    it('should expand a panel when initially collapsed', () => {
      const { result } = renderHook(() => useAppStore());

      // Panels are falsy by default (collapsed)
      expect(result.current.expandedPanels['testPanel']).toBeFalsy();

      act(() => {
        result.current.togglePanel('testPanel');
      });

      expect(result.current.expandedPanels['testPanel']).toBe(true);
    });

    it('should collapse a panel when expanded', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('testPanel'); // Expand
        result.current.togglePanel('testPanel'); // Collapse
      });

      expect(result.current.expandedPanels['testPanel']).toBe(false);
    });

    it('should toggle panel multiple times', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('testPanel');
      });
      expect(result.current.expandedPanels['testPanel']).toBe(true);

      act(() => {
        result.current.togglePanel('testPanel');
      });
      expect(result.current.expandedPanels['testPanel']).toBe(false);

      act(() => {
        result.current.togglePanel('testPanel');
      });
      expect(result.current.expandedPanels['testPanel']).toBe(true);
    });

    it('should mark dirty when panel is toggled (persisted)', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.togglePanel('testPanel');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle multiple independent panels', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('panel1');
        result.current.togglePanel('panel2');
        result.current.togglePanel('panel3');
      });

      expect(result.current.expandedPanels['panel1']).toBe(true);
      expect(result.current.expandedPanels['panel2']).toBe(true);
      expect(result.current.expandedPanels['panel3']).toBe(true);
    });

    it('should not affect other panels when toggling one', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('panel1');
        result.current.togglePanel('panel2');
      });

      act(() => {
        result.current.togglePanel('panel1'); // Collapse panel1
      });

      expect(result.current.expandedPanels['panel1']).toBe(false);
      expect(result.current.expandedPanels['panel2']).toBe(true); // panel2 still expanded
    });
  });

  describe('setWsStatus', () => {
    it('should update WebSocket status to connected', () => {
      const { result } = renderHook(() => useAppStore());
      const status: WebSocketStatus = {
        connected: true,
        reconnecting: false,
        clientCount: 5,
        error: null,
      };

      act(() => {
        result.current.setWsStatus(status);
      });

      expect(result.current.wsStatus).toEqual(status);
    });

    it('should update WebSocket status to disconnected', () => {
      const { result } = renderHook(() => useAppStore());
      const status: WebSocketStatus = {
        connected: false,
        reconnecting: false,
        clientCount: 0,
        error: null,
      };

      act(() => {
        result.current.setWsStatus(status);
      });

      expect(result.current.wsStatus).toEqual(status);
    });

    it('should update WebSocket status to reconnecting', () => {
      const { result } = renderHook(() => useAppStore());
      const status: WebSocketStatus = {
        connected: false,
        reconnecting: true,
        clientCount: 0,
        error: null,
      };

      act(() => {
        result.current.setWsStatus(status);
      });

      expect(result.current.wsStatus.reconnecting).toBe(true);
    });

    it('should handle WebSocket error status', () => {
      const { result } = renderHook(() => useAppStore());
      const status: WebSocketStatus = {
        connected: false,
        reconnecting: false,
        clientCount: 0,
        error: 'Connection failed',
      };

      act(() => {
        result.current.setWsStatus(status);
      });

      expect(result.current.wsStatus.error).toBe('Connection failed');
    });

    it('should update client count', () => {
      const { result } = renderHook(() => useAppStore());
      const status: WebSocketStatus = {
        connected: true,
        reconnecting: false,
        clientCount: 42,
        error: null,
      };

      act(() => {
        result.current.setWsStatus(status);
      });

      expect(result.current.wsStatus.clientCount).toBe(42);
    });

    it('should NOT mark dirty when ws status is changed (ephemeral)', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setWsStatus({
          connected: true,
          reconnecting: false,
          clientCount: 1,
          error: null,
        });
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should handle status transitions', () => {
      const { result } = renderHook(() => useAppStore());

      // Disconnected
      act(() => {
        result.current.setWsStatus({
          connected: false,
          reconnecting: false,
          clientCount: 0,
          error: null,
        });
      });
      expect(result.current.wsStatus.connected).toBe(false);

      // Reconnecting
      act(() => {
        result.current.setWsStatus({
          connected: false,
          reconnecting: true,
          clientCount: 0,
          error: null,
        });
      });
      expect(result.current.wsStatus.reconnecting).toBe(true);

      // Connected
      act(() => {
        result.current.setWsStatus({
          connected: true,
          reconnecting: false,
          clientCount: 3,
          error: null,
        });
      });
      expect(result.current.wsStatus.connected).toBe(true);
      expect(result.current.wsStatus.reconnecting).toBe(false);
    });
  });

  describe('Immer mutations', () => {
    it('should properly mutate expandedPanels with Immer', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('immutable_test_panel1');
      });

      const firstPanels = result.current.expandedPanels;

      act(() => {
        result.current.togglePanel('immutable_test_panel2');
      });

      // Verify immutability - state should be different object
      expect(result.current.expandedPanels).not.toBe(firstPanels);
      expect(result.current.expandedPanels['immutable_test_panel1']).toBe(true);
      expect(result.current.expandedPanels['immutable_test_panel2']).toBe(true);
    });
  });

  describe('persistence behavior', () => {
    it('should only mark dirty for persisted state (expandedPanels)', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
      });

      // These should NOT mark dirty (ephemeral)
      act(() => {
        result.current.setActiveHookTab('response_body');
        result.current.setActiveSubView('inputs');
        result.current.setWsStatus({
          connected: true,
          reconnecting: false,
          clientCount: 1,
          error: null,
        });
      });

      expect(result.current.isDirty).toBe(false);

      // This SHOULD mark dirty (persisted)
      act(() => {
        result.current.togglePanel('testPanel');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('should handle UI navigation flow', () => {
      const { result } = renderHook(() => useAppStore());

      // Navigate to different hook
      act(() => {
        result.current.setActiveHookTab('request_body');
      });
      expect(result.current.activeHookTab).toBe('request_body');

      // Switch to inputs view
      act(() => {
        result.current.setActiveSubView('inputs');
      });
      expect(result.current.activeSubView).toBe('inputs');

      // Expand a panel
      act(() => {
        result.current.togglePanel('detailsPanel');
      });
      expect(result.current.expandedPanels['detailsPanel']).toBe(true);

      // Navigate to another hook
      act(() => {
        result.current.setActiveHookTab('response_headers');
      });
      expect(result.current.activeHookTab).toBe('response_headers');

      // Panel expansion should persist across tab changes
      expect(result.current.expandedPanels['detailsPanel']).toBe(true);
    });

    it('should handle WebSocket connection lifecycle', () => {
      const { result } = renderHook(() => useAppStore());

      // Initially disconnected
      expect(result.current.wsStatus.connected).toBe(false);

      // Connect
      act(() => {
        result.current.setWsStatus({
          connected: true,
          reconnecting: false,
          clientCount: 1,
          error: null,
        });
      });
      expect(result.current.wsStatus.connected).toBe(true);
      expect(result.current.wsStatus.clientCount).toBe(1);

      // Client joins
      act(() => {
        result.current.setWsStatus({
          connected: true,
          reconnecting: false,
          clientCount: 2,
          error: null,
        });
      });
      expect(result.current.wsStatus.clientCount).toBe(2);

      // Connection lost, reconnecting
      act(() => {
        result.current.setWsStatus({
          connected: false,
          reconnecting: true,
          clientCount: 0,
          error: null,
        });
      });
      expect(result.current.wsStatus.connected).toBe(false);
      expect(result.current.wsStatus.reconnecting).toBe(true);

      // Reconnection failed
      act(() => {
        result.current.setWsStatus({
          connected: false,
          reconnecting: false,
          clientCount: 0,
          error: 'Failed to reconnect',
        });
      });
      expect(result.current.wsStatus.error).toBe('Failed to reconnect');
    });

    it('should manage multiple panels independently', () => {
      const { result } = renderHook(() => useAppStore());

      const panels = ['config', 'results', 'logs', 'properties'];

      // Expand all panels
      act(() => {
        panels.forEach(panel => result.current.togglePanel(panel));
      });

      panels.forEach(panel => {
        expect(result.current.expandedPanels[panel]).toBe(true);
      });

      // Collapse half of them
      act(() => {
        result.current.togglePanel('config');
        result.current.togglePanel('logs');
      });

      expect(result.current.expandedPanels['config']).toBe(false);
      expect(result.current.expandedPanels['results']).toBe(true);
      expect(result.current.expandedPanels['logs']).toBe(false);
      expect(result.current.expandedPanels['properties']).toBe(true);
    });
  });
});
