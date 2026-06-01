export function validateString(value: unknown, name: string, options?: { required?: boolean; minLength?: number; maxLength?: number }): string | null {
  if (value === undefined || value === null) {
    return options?.required ? `${name} is required` : null;
  }
  if (typeof value !== 'string') {
    return `${name} must be a string`;
  }
  if (options?.minLength && value.length < options.minLength) {
    return `${name} must be at least ${options.minLength} characters`;
  }
  if (options?.maxLength && value.length > options.maxLength) {
    return `${name} must be at most ${options.maxLength} characters`;
  }
  return null;
}

export function validateNumber(value: unknown, name: string, options?: { required?: boolean; min?: number; max?: number }): string | null {
  if (value === undefined || value === null) {
    return options?.required ? `${name} is required` : null;
  }
  if (typeof value !== 'number' || isNaN(value)) {
    return `${name} must be a number`;
  }
  if (options?.min !== undefined && value < options.min) {
    return `${name} must be at least ${options.min}`;
  }
  if (options?.max !== undefined && value > options.max) {
    return `${name} must be at most ${options.max}`;
  }
  return null;
}

export function validateArray(value: unknown, name: string, options?: { required?: boolean; minLength?: number; maxLength?: number }): string | null {
  if (value === undefined || value === null) {
    return options?.required ? `${name} is required` : null;
  }
  if (!Array.isArray(value)) {
    return `${name} must be an array`;
  }
  if (options?.minLength && value.length < options.minLength) {
    return `${name} must have at least ${options.minLength} items`;
  }
  if (options?.maxLength && value.length > options.maxLength) {
    return `${name} must have at most ${options.maxLength} items`;
  }
  return null;
}

export function validateEnum(value: unknown, name: string, allowedValues: string[], options?: { required?: boolean }): string | null {
  if (value === undefined || value === null) {
    return options?.required ? `${name} is required` : null;
  }
  if (!allowedValues.includes(value as string)) {
    return `${name} must be one of: ${allowedValues.join(', ')}`;
  }
  return null;
}

export function validateConversationId(value: unknown): string | null {
  return validateString(value, 'conversationId', { required: true, minLength: 1, maxLength: 100 });
}

export function validateWorkspaceId(value: unknown): string | null {
  return validateString(value, 'workspaceId', { required: false, minLength: 1, maxLength: 100 });
}

export function validateMessageText(value: unknown): string | null {
  return validateString(value, 'text', { required: true, minLength: 1, maxLength: 10000 });
}

export function validateConversationTitle(value: unknown): string | null {
  return validateString(value, 'title', { required: false, minLength: 1, maxLength: 200 });
}

export function validateConversationType(value: unknown): string | null {
  return validateEnum(value, 'type', ['direct', 'group'], { required: false });
}

export function validateParticipants(value: unknown): string | null {
  const arrayError = validateArray(value, 'participants', { required: false, maxLength: 100 });
  if (arrayError) return arrayError;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string') return `participants[${i}] must be a string`;
    }
  }
  return null;
}

export function validateSearchQuery(value: unknown): string | null {
  return validateString(value, 'query', { required: true, minLength: 1, maxLength: 200 });
}