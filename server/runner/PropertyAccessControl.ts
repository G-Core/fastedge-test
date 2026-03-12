/**
 * Property Access Control for Production Parity
 *
 * Enforces FastEdge production rules for property access:
 * - Built-in properties have hook-specific access levels (read-only, read-write, write-only)
 * - Custom properties created in onRequestHeaders are NOT available in other hooks
 * - Custom properties created in onRequestBody+ are available in subsequent hooks
 */

// Property access levels
export enum PropertyAccess {
  ReadOnly = 'read-only',
  ReadWrite = 'read-write',
  WriteOnly = 'write-only',
}

// Hook context types
export enum HookContext {
  OnRequestHeaders = 'onRequestHeaders',
  OnRequestBody = 'onRequestBody',
  OnResponseHeaders = 'onResponseHeaders',
  OnResponseBody = 'onResponseBody',
}

// Property definition with hook-specific access
export interface PropertyDefinition {
  path: string;
  type: 'string' | 'integer';
  access: {
    [HookContext.OnRequestHeaders]?: PropertyAccess;
    [HookContext.OnRequestBody]?: PropertyAccess;
    [HookContext.OnResponseHeaders]?: PropertyAccess;
    [HookContext.OnResponseBody]?: PropertyAccess;
  };
  description: string;
}

// Access check result
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

// Custom property tracking
interface CustomPropertyData {
  createdIn: HookContext;
  value: Uint8Array;
}

/**
 * Built-in properties whitelist with FastEdge production access rules
 */
export const BUILT_IN_PROPERTIES: PropertyDefinition[] = [
  // Request URL properties (writable in onRequestHeaders)
  {
    path: 'request.url',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadWrite,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Original URL path before modifications',
  },
  {
    path: 'request.host',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadWrite,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Host header value',
  },
  {
    path: 'request.path',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadWrite,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Request URL path',
  },
  {
    path: 'request.query',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadWrite,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Query string parameters',
  },

  // Request read-only properties
  {
    path: 'request.scheme',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Protocol scheme (http/https)',
  },
  {
    path: 'request.method',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'HTTP method (GET, POST, etc.)',
  },
  {
    path: 'request.extension',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Request path extension',
  },

  // Geolocation properties (read-only)
  {
    path: 'request.country',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Country Code - deciphered from IP',
  },
  {
    path: 'request.city',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'City name - deciphered from IP',
  },
  {
    path: 'request.asn',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'ASN of the network/ISP associated with the request IP',
  },
  {
    path: 'request.geo.lat',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Latitude - deciphered from IP',
  },
  {
    path: 'request.geo.long',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Longitude - deciphered from IP',
  },
  {
    path: 'request.region',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Region - deciphered from IP',
  },
  {
    path: 'request.continent',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Continent - deciphered from IP',
  },
  {
    path: 'request.country.name',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnRequestBody]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'Country name - deciphered from IP',
  },

  // Nginx logging (write-only in onRequestHeaders)
  {
    path: 'nginx.log_field1',
    type: 'string',
    access: {
      [HookContext.OnRequestHeaders]: PropertyAccess.WriteOnly,
      // Not accessible in other hooks
    },
    description: 'Adds value to nginx access logs',
  },

  // Response properties (read-only in response hooks)
  {
    path: 'response.status',
    type: 'integer',
    access: {
      [HookContext.OnResponseHeaders]: PropertyAccess.ReadOnly,
      [HookContext.OnResponseBody]: PropertyAccess.ReadOnly,
    },
    description: 'HTTP status code',
  },
];

/**
 * PropertyAccessControl class
 *
 * Manages property access rules and enforces production parity behavior
 */
export class PropertyAccessControl {
  private builtInProperties: Map<string, PropertyDefinition>;
  private customProperties: Map<string, CustomPropertyData>;

  constructor() {
    this.builtInProperties = new Map();
    this.customProperties = new Map();

    // Initialize built-in properties map
    this.initializeBuiltInProperties(BUILT_IN_PROPERTIES);
  }

  /**
   * Initialize built-in properties whitelist
   * Called after BUILT_IN_PROPERTIES array is defined
   */
  initializeBuiltInProperties(properties: PropertyDefinition[]): void {
    this.builtInProperties.clear();
    for (const prop of properties) {
      this.builtInProperties.set(prop.path, prop);
    }
  }

  /**
   * Check if get_property is allowed
   */
  canGetProperty(path: string, currentHook: HookContext): AccessCheckResult {
    const builtIn = this.builtInProperties.get(path);

    if (builtIn) {
      // Built-in property
      return this.canGetBuiltInProperty(builtIn, currentHook);
    } else {
      // Custom property
      return this.canGetCustomProperty(path, currentHook);
    }
  }

  /**
   * Check if set_property is allowed
   */
  canSetProperty(path: string, currentHook: HookContext): AccessCheckResult {
    const builtIn = this.builtInProperties.get(path);

    if (builtIn) {
      // Built-in property
      return this.canSetBuiltInProperty(builtIn, currentHook);
    } else {
      // Custom property
      return this.canSetCustomProperty(path, currentHook);
    }
  }

  /**
   * Register custom property creation/modification
   */
  registerCustomProperty(path: string, value: Uint8Array, hook: HookContext): void {
    if (!this.customProperties.has(path)) {
      // New custom property
      this.customProperties.set(path, {
        createdIn: hook,
        value,
      });
    } else {
      // Update existing custom property value
      this.customProperties.get(path)!.value = value;
    }
  }

  /**
   * Reset custom properties when moving between hook contexts
   * Called when transitioning from request to response hooks
   */
  resetCustomPropertiesForNewContext(): void {
    // Remove all custom properties created in onRequestHeaders
    // (they're not available in subsequent hooks per production behavior)
    for (const [path, data] of this.customProperties.entries()) {
      if (data.createdIn === HookContext.OnRequestHeaders) {
        this.customProperties.delete(path);
      }
    }
  }

  /**
   * Check if built-in property can be read in current hook
   */
  private canGetBuiltInProperty(
    property: PropertyDefinition,
    currentHook: HookContext
  ): AccessCheckResult {
    const access = property.access[currentHook];

    if (!access) {
      return {
        allowed: false,
        reason: `Property '${property.path}' is not accessible in ${currentHook}`,
      };
    }

    if (access === PropertyAccess.WriteOnly) {
      return {
        allowed: false,
        reason: `Property '${property.path}' is write-only in ${currentHook}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if built-in property can be written in current hook
   */
  private canSetBuiltInProperty(
    property: PropertyDefinition,
    currentHook: HookContext
  ): AccessCheckResult {
    const access = property.access[currentHook];

    if (!access) {
      return {
        allowed: false,
        reason: `Property '${property.path}' is not accessible in ${currentHook}`,
      };
    }

    if (access === PropertyAccess.ReadOnly) {
      return {
        allowed: false,
        reason: `Property '${property.path}' is read-only in ${currentHook}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if custom property can be read in current hook
   */
  private canGetCustomProperty(path: string, currentHook: HookContext): AccessCheckResult {
    const custom = this.customProperties.get(path);

    if (!custom) {
      // Property doesn't exist yet
      return {
        allowed: false,
        reason: `Custom property '${path}' does not exist`,
      };
    }

    // Check hook context boundary
    if (custom.createdIn === HookContext.OnRequestHeaders) {
      // Properties created in onRequestHeaders are NOT available in other hooks
      if (currentHook !== HookContext.OnRequestHeaders) {
        return {
          allowed: false,
          reason: `Custom property '${path}' was created in onRequestHeaders and is not available in ${currentHook}`,
        };
      }
    }

    // Properties created in onRequestBody onwards are available in subsequent hooks
    return { allowed: true };
  }

  /**
   * Check if custom property can be written in current hook
   */
  private canSetCustomProperty(path: string, currentHook: HookContext): AccessCheckResult {
    const custom = this.customProperties.get(path);

    if (custom) {
      // Existing custom property
      if (custom.createdIn === HookContext.OnRequestHeaders) {
        // Properties created in onRequestHeaders can only be modified in onRequestHeaders
        if (currentHook !== HookContext.OnRequestHeaders) {
          return {
            allowed: false,
            reason: `Custom property '${path}' was created in onRequestHeaders and cannot be modified in ${currentHook}`,
          };
        }
      }
    }

    // New custom property or valid modification
    return { allowed: true };
  }

  /**
   * Get debug information about a property
   */
  getPropertyInfo(path: string): string {
    const builtIn = this.builtInProperties.get(path);
    if (builtIn) {
      return `Built-in property: ${builtIn.description}`;
    }

    const custom = this.customProperties.get(path);
    if (custom) {
      return `Custom property created in ${custom.createdIn}`;
    }

    return 'Property does not exist';
  }
}
