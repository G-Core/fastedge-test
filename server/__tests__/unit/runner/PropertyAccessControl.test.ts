import {
  PropertyAccessControl,
  PropertyAccess,
  HookContext,
  BUILT_IN_PROPERTIES,
} from '../../../runner/PropertyAccessControl';

describe('PropertyAccessControl', () => {
  describe('Built-in properties', () => {
    let control: PropertyAccessControl;

    beforeEach(() => {
      control = new PropertyAccessControl(); // Enforce rules
    });

    describe('request.url property', () => {
      it('allows reading request.url in all hooks', () => {
        expect(control.canGetProperty('request.url', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canGetProperty('request.url', HookContext.OnRequestBody).allowed).toBe(true);
        expect(control.canGetProperty('request.url', HookContext.OnResponseHeaders).allowed).toBe(true);
        expect(control.canGetProperty('request.url', HookContext.OnResponseBody).allowed).toBe(true);
      });

      it('allows writing request.url only in onRequestHeaders', () => {
        expect(control.canSetProperty('request.url', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canSetProperty('request.url', HookContext.OnRequestBody).allowed).toBe(false);
        expect(control.canSetProperty('request.url', HookContext.OnResponseHeaders).allowed).toBe(false);
        expect(control.canSetProperty('request.url', HookContext.OnResponseBody).allowed).toBe(false);
      });

      it('provides clear reason when write is denied', () => {
        const result = control.canSetProperty('request.url', HookContext.OnRequestBody);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('read-only');
      });
    });

    describe('request.host property', () => {
      it('allows reading request.host in all hooks', () => {
        expect(control.canGetProperty('request.host', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canGetProperty('request.host', HookContext.OnRequestBody).allowed).toBe(true);
      });

      it('allows writing request.host only in onRequestHeaders', () => {
        expect(control.canSetProperty('request.host', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canSetProperty('request.host', HookContext.OnRequestBody).allowed).toBe(false);
      });
    });

    describe('request.path property', () => {
      it('allows writing request.path only in onRequestHeaders', () => {
        expect(control.canSetProperty('request.path', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canSetProperty('request.path', HookContext.OnResponseHeaders).allowed).toBe(false);
      });
    });

    describe('request.query property', () => {
      it('allows writing request.query only in onRequestHeaders', () => {
        expect(control.canSetProperty('request.query', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canSetProperty('request.query', HookContext.OnRequestBody).allowed).toBe(false);
      });
    });

    describe('request.method property (read-only)', () => {
      it('allows reading request.method in all hooks', () => {
        expect(control.canGetProperty('request.method', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canGetProperty('request.method', HookContext.OnRequestBody).allowed).toBe(true);
      });

      it('denies writing request.method in all hooks', () => {
        expect(control.canSetProperty('request.method', HookContext.OnRequestHeaders).allowed).toBe(false);
        expect(control.canSetProperty('request.method', HookContext.OnRequestBody).allowed).toBe(false);
      });

      it('provides clear reason when write is denied', () => {
        const result = control.canSetProperty('request.method', HookContext.OnRequestHeaders);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('read-only');
      });
    });

    describe('request.scheme property (read-only)', () => {
      it('denies writing request.scheme in all hooks', () => {
        expect(control.canSetProperty('request.scheme', HookContext.OnRequestHeaders).allowed).toBe(false);
        expect(control.canSetProperty('request.scheme', HookContext.OnRequestBody).allowed).toBe(false);
      });
    });

    describe('nginx.log_field1 property (write-only)', () => {
      it('allows writing nginx.log_field1 only in onRequestHeaders', () => {
        expect(control.canSetProperty('nginx.log_field1', HookContext.OnRequestHeaders).allowed).toBe(true);
        expect(control.canSetProperty('nginx.log_field1', HookContext.OnRequestBody).allowed).toBe(false);
        expect(control.canSetProperty('nginx.log_field1', HookContext.OnResponseHeaders).allowed).toBe(false);
      });

      it('denies reading nginx.log_field1 (write-only)', () => {
        expect(control.canGetProperty('nginx.log_field1', HookContext.OnRequestHeaders).allowed).toBe(false);
      });

      it('provides clear reason when read is denied', () => {
        const result = control.canGetProperty('nginx.log_field1', HookContext.OnRequestHeaders);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('write-only');
      });
    });

    describe('response.status property', () => {
      it('allows reading response.status in response hooks', () => {
        expect(control.canGetProperty('response.status', HookContext.OnResponseHeaders).allowed).toBe(true);
        expect(control.canGetProperty('response.status', HookContext.OnResponseBody).allowed).toBe(true);
      });

      it('denies reading response.status in request hooks', () => {
        expect(control.canGetProperty('response.status', HookContext.OnRequestHeaders).allowed).toBe(false);
        expect(control.canGetProperty('response.status', HookContext.OnRequestBody).allowed).toBe(false);
      });

      it('denies writing response.status (read-only)', () => {
        expect(control.canSetProperty('response.status', HookContext.OnResponseHeaders).allowed).toBe(false);
        expect(control.canSetProperty('response.status', HookContext.OnResponseBody).allowed).toBe(false);
      });
    });

    describe('Geolocation properties (read-only)', () => {
      const geoProperties = [
        'request.country',
        'request.city',
        'request.asn',
        'request.geo.lat',
        'request.geo.long',
        'request.region',
        'request.continent',
        'request.country.name',
      ];

      geoProperties.forEach((prop) => {
        it(`allows reading ${prop} in all hooks`, () => {
          expect(control.canGetProperty(prop, HookContext.OnRequestHeaders).allowed).toBe(true);
          expect(control.canGetProperty(prop, HookContext.OnRequestBody).allowed).toBe(true);
        });

        it(`denies writing ${prop} (read-only)`, () => {
          expect(control.canSetProperty(prop, HookContext.OnRequestHeaders).allowed).toBe(false);
          expect(control.canSetProperty(prop, HookContext.OnRequestBody).allowed).toBe(false);
        });
      });
    });
  });

  describe('Custom properties', () => {
    let control: PropertyAccessControl;

    beforeEach(() => {
      control = new PropertyAccessControl(); // Enforce rules
    });

    describe('Custom properties created in onRequestHeaders', () => {
      it('denies access to custom properties created in onRequestHeaders from other hooks', () => {
        const value = new Uint8Array([1, 2, 3]);
        control.registerCustomProperty('custom.prop', value, HookContext.OnRequestHeaders);

        // Accessible in onRequestHeaders
        expect(control.canGetProperty('custom.prop', HookContext.OnRequestHeaders).allowed).toBe(true);

        // NOT accessible in other hooks
        expect(control.canGetProperty('custom.prop', HookContext.OnRequestBody).allowed).toBe(false);
        expect(control.canGetProperty('custom.prop', HookContext.OnResponseHeaders).allowed).toBe(false);
        expect(control.canGetProperty('custom.prop', HookContext.OnResponseBody).allowed).toBe(false);
      });

      it('provides clear reason when access is denied', () => {
        const value = new Uint8Array([1, 2, 3]);
        control.registerCustomProperty('custom.test', value, HookContext.OnRequestHeaders);

        const result = control.canGetProperty('custom.test', HookContext.OnRequestBody);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('created in onRequestHeaders');
        expect(result.reason).toContain('not available');
      });

      it('denies modifying custom properties from onRequestHeaders in other hooks', () => {
        const value = new Uint8Array([1, 2, 3]);
        control.registerCustomProperty('custom.modify', value, HookContext.OnRequestHeaders);

        // Can modify in onRequestHeaders
        expect(control.canSetProperty('custom.modify', HookContext.OnRequestHeaders).allowed).toBe(true);

        // Cannot modify in other hooks
        expect(control.canSetProperty('custom.modify', HookContext.OnRequestBody).allowed).toBe(false);
      });
    });

    describe('Custom properties created in onRequestBody onwards', () => {
      it('allows access to custom properties created in onResponseHeaders from onResponseBody', () => {
        const value = new Uint8Array([116, 114, 117, 101]); // "true"
        control.registerCustomProperty('response.markdown', value, HookContext.OnResponseHeaders);

        // Accessible in onResponseBody
        expect(control.canGetProperty('response.markdown', HookContext.OnResponseBody).allowed).toBe(true);
      });

      it('allows access to custom properties created in onRequestBody from response hooks', () => {
        const value = new Uint8Array([1]);
        control.registerCustomProperty('custom.data', value, HookContext.OnRequestBody);

        expect(control.canGetProperty('custom.data', HookContext.OnRequestBody).allowed).toBe(true);
        expect(control.canGetProperty('custom.data', HookContext.OnResponseHeaders).allowed).toBe(true);
        expect(control.canGetProperty('custom.data', HookContext.OnResponseBody).allowed).toBe(true);
      });
    });

    describe('resetCustomPropertiesForNewContext', () => {
      it('resets onRequestHeaders custom properties when moving to response hooks', () => {
        // Create custom property in onRequestHeaders
        const value1 = new Uint8Array([1]);
        control.registerCustomProperty('custom.req', value1, HookContext.OnRequestHeaders);

        // Create custom property in onRequestBody
        const value2 = new Uint8Array([2]);
        control.registerCustomProperty('custom.body', value2, HookContext.OnRequestBody);

        // Reset for new context
        control.resetCustomPropertiesForNewContext();

        // onRequestHeaders property should be gone
        expect(control.canGetProperty('custom.req', HookContext.OnResponseHeaders).allowed).toBe(false);

        // onRequestBody property should still exist
        expect(control.canGetProperty('custom.body', HookContext.OnResponseHeaders).allowed).toBe(true);
      });
    });

    describe('Non-existent custom properties', () => {
      it('denies access to custom properties that do not exist', () => {
        const result = control.canGetProperty('custom.nonexistent', HookContext.OnRequestHeaders);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('does not exist');
      });

      it('allows creating new custom properties', () => {
        expect(control.canSetProperty('custom.new', HookContext.OnRequestBody).allowed).toBe(true);
        expect(control.canSetProperty('custom.new2', HookContext.OnResponseHeaders).allowed).toBe(true);
      });
    });
  });

  describe('getPropertyInfo debug helper', () => {
    let control: PropertyAccessControl;

    beforeEach(() => {
      control = new PropertyAccessControl();
    });

    it('returns info for built-in properties', () => {
      const info = control.getPropertyInfo('request.url');
      expect(info).toContain('Built-in property');
    });

    it('returns info for custom properties', () => {
      const value = new Uint8Array([1]);
      control.registerCustomProperty('custom.test', value, HookContext.OnRequestBody);
      const info = control.getPropertyInfo('custom.test');
      expect(info).toContain('Custom property created in onRequestBody');
    });

    it('returns info for non-existent properties', () => {
      const info = control.getPropertyInfo('nonexistent');
      expect(info).toContain('does not exist');
    });
  });

  describe('Built-in properties whitelist validation', () => {
    it('BUILT_IN_PROPERTIES array is defined', () => {
      expect(BUILT_IN_PROPERTIES).toBeDefined();
      expect(Array.isArray(BUILT_IN_PROPERTIES)).toBe(true);
      expect(BUILT_IN_PROPERTIES.length).toBeGreaterThan(0);
    });

    it('all properties have required fields', () => {
      BUILT_IN_PROPERTIES.forEach((prop) => {
        expect(prop.path).toBeDefined();
        expect(prop.type).toBeDefined();
        expect(prop.access).toBeDefined();
        expect(prop.description).toBeDefined();
      });
    });

    it('includes expected critical properties', () => {
      const paths = BUILT_IN_PROPERTIES.map((p) => p.path);
      expect(paths).toContain('request.url');
      expect(paths).toContain('request.host');
      expect(paths).toContain('request.method');
      expect(paths).toContain('nginx.log_field1');
      expect(paths).toContain('response.status');
    });
  });
});
