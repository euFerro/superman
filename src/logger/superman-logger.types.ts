// -- BASE EVENTS -------------------------------------------------------------
export enum LogIndexSuffix {
    SYSTEM = 'system-logs',
    ERROR = 'error-logs',
    REQUEST = 'request-logs',
    RESPONSE = 'response-logs',
    AUDIT = 'audit-logs',
    SECURITY = 'security-logs',
}

export enum EventType {
    SYSTEM = 'SYSTEM',
    ERROR = 'ERROR',
    REQUEST = 'REQUEST',
    RESPONSE = 'RESPONSE',
    AUDIT = 'AUDIT',
    SECURITY = 'SECURITY',
}

/**
 * String-literal alias of {@link EventType}, for use in user-facing config
 * (`'SYSTEM' | 'ERROR' | 'REQUEST' | 'RESPONSE' | 'AUDIT' | 'SECURITY'`).
 * The framework keeps the enum for internal dispatch, but the public config
 * accepts plain strings for readability.
 */
export type EventTypeName = `${EventType}`;

export enum EventSeverity {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    SECURITY = 'SECURITY',
    FATAL = 'FATAL',
}

/** String-literal alias of {@link EventSeverity}, for use in config. */
export type EventSeverityName = `${EventSeverity}`;

export interface BaseLog {
    '@timestamp': string;
    eventType?: EventType;
    eventSeverity?: EventSeverity;
    // --- SERVER / INFRASTRUCTURE ---
    appName: string;
    appVersion: string;
    environment: string;
    serverInstanceUid: string;
    hostname: string;
    uptimeMs: number;
    memoryUsage: number;
    cpuUsage: number;
    // -- SERVICE --
    context: string;
    // -- NETWORK SOURCE / ERROR TRACKING --
    ip?: string;
    requestId?: string;
    // --- IDENTITY ---
    userId?: string;
    sessionId?: string;
    traceId?: string;
    clientFingerprint?: string;
    // -- OPTIONAL DATA --
    metadata?: Record<string, unknown>;
}

// -- SYSTEM EVENTS -------------------------------------------------------------
export enum SystemEvent {
    SERVICE_STARTED = 'SERVICE_STARTED',
    DB_CONNECTED = 'DB_CONNECTED',
    ADMIN_REQUESTED_SERVER_INFO = 'ADMIN_REQUESTED_SERVER_INFO',
    MANUAL_SHUTDOWN_ACTION = 'MANUAL_SHUTDOWN_ACTION',
    SYSTEM_SIGNAL_RECEIVED = 'SYSTEM_SIGNAL_RECEIVED',
    RABBITMQ_CONNECTED = 'RABBITMQ_CONNECTED',
    UPDATED_STATS = 'UPDATED_STATS',
}

export enum SystemStatus {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
}

export interface SystemLog extends BaseLog {
    readonly eventType: EventType.SYSTEM;

    systemStatus: SystemStatus;
    systemEvent: SystemEvent;
    systemMessage: string;
}

// -- ERROR EVENTS -------------------------------------------------------------
export enum ErrorType {
    RUNTIME_ERROR = 'RUNTIME_ERROR',
    HTTP_EXCEPTION = 'HTTP_EXCEPTION',
    BUSINESS_EXCEPTION = 'BUSINESS_EXCEPTION',

    RFC_COMMUNICATION_FAILURE = 'RFC_COMMUNICATION_FAILURE',

    RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

    UPSTREAM_ERROR = 'UPSTREAM_ERROR',
    EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
    THIRD_PARTY_LIMIT = 'THIRD_PARTY_LIMIT',

    DATABASE_ERROR = 'DATABASE_ERROR',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',

    UNKNOWN_EXCEPTION = 'UNKNOWN_EXCEPTION',
}



export interface ErrorLog extends BaseLog {
    readonly eventType: EventType.ERROR;
    eventSeverity: EventSeverity.ERROR;

    causeUrl: string;
    requestId: string;
    errorType: ErrorType;

    errorMessage: string;
    stackTrace?: string;
}

// -- NETWORK EVENTS -------------------------------------------------------------
export interface RequestLog extends BaseLog {
    readonly eventType: EventType.REQUEST;
    eventSeverity: EventSeverity;

    ip: string;
    requestId: string;

    method: string;
    url: string;
    route: string;
    query?: Record<string, string>;
    userAgent?: string;
    referrer?: string;

    userId?: string;
    sessionId?: string;
    traceId?: string;
    clientFingerprint?: string;

    location?: {
        lat: number;
        lon: number;
    };
    continent?: string;
    country?: string;
    city?: string;
    postalCode?: string;
    timezone?: string;

    requestBody?: unknown;
    bytesReceived: number;
}

export interface ResponseLog extends BaseLog {
    readonly eventType: EventType.RESPONSE;
    eventSeverity: EventSeverity;

    requestId: string;

    route: string;
    statusCode: number;
    statusClass: '2xx' | '3xx' | '4xx' | '5xx';
    responseTimeMs: number;

    responseBody?: unknown;
    bytesSent?: number;
}

// -- AUDIT EVENTS -------------------------------------------------------------
export enum AuditEvents {
    USER_CREATED = 'USER_CREATED',
    USER_UPDATED = 'USER_UPDATED',
    USER_DELETED = 'USER_DELETED',
    USER_PASSWORD_RESET_REQUESTED = 'USER_PASSWORD_RESET_REQUESTED',
    USER_PERMISSIONS_CHANGED = 'USER_PERMISSIONS_CHANGED',

    IMPERSONATION_STARTED = 'IMPERSONATION_STARTED',
    IMPERSONATION_ENDED = 'IMPERSONATION_ENDED',

    SESSION_STARTED = 'SESSION_STARTED',
    SESSION_ENDED = 'SESSION_ENDED',

    MCP_SESSION_STARTED = 'MCP_SESSION_STARTED',
    MCP_SESSION_ENDED = 'MCP_SESSION_ENDED',
    MCP_TOOL_EXECUTED = 'MCP_TOOL_EXECUTED',

    RESOURCE_CREATED = 'RESOURCE_CREATED',
    RESOURCE_UPDATED = 'RESOURCE_UPDATED',
    RESOURCE_DELETED = 'RESOURCE_DELETED',
    RESOURCE_RESTORED = 'RESOURCE_RESTORED',

    DATA_EXPORTED = 'DATA_EXPORTED',
    DATA_SENSITIVE_VIEWED = 'DATA_SENSITIVE_VIEWED',
    DATA_BATCH_UPLOADED = 'DATA_BATCH_UPLOADED',
    DATA_ARCHIVED = 'DATA_ARCHIVED',

    CONFIG_SETTING_CHANGED = 'CONFIG_SETTING_CHANGED',
    FEATURE_FLAG_TOGGLED = 'FEATURE_FLAG_TOGGLED',
    API_KEY_GENERATED = 'API_KEY_GENERATED',
    WEBHOOK_SUBSCRIPTION_ADDED = 'WEBHOOK_SUBSCRIPTION_ADDED',

    TRANSACTION_VOIDED = 'TRANSACTION_VOIDED',
    REFUND_ISSUED = 'REFUND_ISSUED',
    PRICE_OVERRIDDEN = 'PRICE_OVERRIDDEN',
}

export interface AuditLog extends BaseLog {
    readonly eventType: EventType.AUDIT;

    auditEvent: AuditEvents;
    userRoles: string[];
    auditMessage: string;

    resource: string;
    resourceId?: string;

    changes?: Record<string, {
        before?: unknown;
        after?: unknown;
    }>;
}

// -- SECURITY EVENTS -------------------------------------------------------------
export enum SecurityEvents {
    LOGIN_SUCCESS = 'LOGIN_SUCCESS',
    LOGIN_FAILED = 'LOGIN_FAILED',
    LOGOUT = 'LOGOUT',
    MAX_LOGIN_ATTEMPTS = 'MAX_LOGIN_ATTEMPTS',
    MFA_REQUIRED = 'MFA_REQUIRED',
    MFA_FAILED = 'MFA_FAILED',

    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    TOKEN_INVALID = 'TOKEN_INVALID',
    TOKEN_REVOKED = 'TOKEN_REVOKED',
    REFRESH_TOKEN_REUSE = 'REFRESH_TOKEN_REUSE',
    SESSION_HIJACK_SUSPECTED = 'SESSION_HIJACK_SUSPECTED',

    UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
    FORBIDDEN_ACTION = 'FORBIDDEN_ACTION',
    SUDO_MODE_ENTERED = 'SUDO_MODE_ENTERED',
    API_KEY_EXHAUSTED = 'API_KEY_EXHAUSTED',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

    SUSPICIOUS_INPUT_DETECTED = 'SUSPICIOUS_INPUT_DETECTED',
    MALFORMED_PAYLOAD = 'MALFORMED_PAYLOAD',
    PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
    FILE_UPLOAD_BLOCKED = 'FILE_UPLOAD_BLOCKED',

    PASSWORD_CHANGED = 'PASSWORD_CHANGED',
    RECOVERY_EMAIL_SENT = 'RECOVERY_EMAIL_SENT',
    ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
    ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
}

export enum SecuritySeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL',
}

export enum AuthOutcome {
    ALLOWED = 'ALLOWED',
    DENIED = 'DENIED',
    BLOCKED_TEMPORARILY = 'BLOCKED_TEMPORARILY',
    BLOCKED_PERMANENTLY = 'BLOCKED_PERMANENTLY',
}

export interface SecurityLog extends BaseLog {
    readonly eventType: EventType.SECURITY;
    eventSeverity: EventSeverity;

    ip: string;
    traceId: string;
    requestId: string;

    securityEvent: SecurityEvents;
    authOutcome: AuthOutcome;

    securityMessage: string;
}
