import {
  validateString,
  validateNumber,
  validateArray,
  validateEnum,
  validateConversationId,
  validateWorkspaceId,
  validateMessageText,
  validateConversationTitle,
  validateConversationType,
  validateParticipants,
  validateSearchQuery,
} from '../validators';

describe('Validators', () => {
  describe('validateString', () => {
    it('should return null for valid string', () => {
      expect(validateString('hello', 'name')).toBeNull();
    });

    it('should return error for non-string value', () => {
      expect(validateString(123, 'name')).toBe('name must be a string');
    });

    it('should return error when required and missing', () => {
      expect(validateString(undefined, 'name', { required: true })).toBe('name is required');
      expect(validateString(null, 'name', { required: true })).toBe('name is required');
    });

    it('should return null when not required and missing', () => {
      expect(validateString(undefined, 'name')).toBeNull();
      expect(validateString(null, 'name')).toBeNull();
    });

    it('should validate minLength', () => {
      expect(validateString('ab', 'name', { minLength: 3 })).toBe('name must be at least 3 characters');
      expect(validateString('abc', 'name', { minLength: 3 })).toBeNull();
    });

    it('should validate maxLength', () => {
      expect(validateString('abcd', 'name', { maxLength: 3 })).toBe('name must be at most 3 characters');
      expect(validateString('abc', 'name', { maxLength: 3 })).toBeNull();
    });
  });

  describe('validateNumber', () => {
    it('should return null for valid number', () => {
      expect(validateNumber(123, 'count')).toBeNull();
    });

    it('should return error for non-number value', () => {
      expect(validateNumber('abc', 'count')).toBe('count must be a number');
    });

    it('should return error for NaN', () => {
      expect(validateNumber(NaN, 'count')).toBe('count must be a number');
    });

    it('should validate min', () => {
      expect(validateNumber(5, 'count', { min: 10 })).toBe('count must be at least 10');
      expect(validateNumber(10, 'count', { min: 10 })).toBeNull();
    });

    it('should validate max', () => {
      expect(validateNumber(15, 'count', { max: 10 })).toBe('count must be at most 10');
      expect(validateNumber(10, 'count', { max: 10 })).toBeNull();
    });
  });

  describe('validateArray', () => {
    it('should return null for valid array', () => {
      expect(validateArray([1, 2, 3], 'items')).toBeNull();
    });

    it('should return error for non-array value', () => {
      expect(validateArray('abc', 'items')).toBe('items must be an array');
    });

    it('should validate minLength', () => {
      expect(validateArray([1], 'items', { minLength: 2 })).toBe('items must have at least 2 items');
      expect(validateArray([1, 2], 'items', { minLength: 2 })).toBeNull();
    });

    it('should validate maxLength', () => {
      expect(validateArray([1, 2, 3], 'items', { maxLength: 2 })).toBe('items must have at most 2 items');
      expect(validateArray([1, 2], 'items', { maxLength: 2 })).toBeNull();
    });
  });

  describe('validateEnum', () => {
    it('should return null for valid enum value', () => {
      expect(validateEnum('direct', 'type', ['direct', 'group'])).toBeNull();
    });

    it('should return error for invalid enum value', () => {
      expect(validateEnum('invalid', 'type', ['direct', 'group'])).toBe('type must be one of: direct, group');
    });
  });

  describe('validateConversationId', () => {
    it('should return null for valid conversation id', () => {
      expect(validateConversationId('conv-123')).toBeNull();
    });

    it('should return error for missing conversation id', () => {
      expect(validateConversationId(undefined)).toBe('conversationId is required');
    });

    it('should return error for empty conversation id', () => {
      expect(validateConversationId('')).toBe('conversationId must be at least 1 characters');
    });
  });

  describe('validateWorkspaceId', () => {
    it('should return null for valid workspace id', () => {
      expect(validateWorkspaceId('workspace-123')).toBeNull();
    });

    it('should return null for missing workspace id (not required)', () => {
      expect(validateWorkspaceId(undefined)).toBeNull();
    });
  });

  describe('validateMessageText', () => {
    it('should return null for valid message text', () => {
      expect(validateMessageText('Hello world')).toBeNull();
    });

    it('should return error for missing message text', () => {
      expect(validateMessageText(undefined)).toBe('text is required');
    });

    it('should return error for empty message text', () => {
      expect(validateMessageText('')).toBe('text must be at least 1 characters');
    });

    it('should return error for too long message text', () => {
      const longText = 'a'.repeat(10001);
      expect(validateMessageText(longText)).toBe('text must be at most 10000 characters');
    });
  });

  describe('validateConversationTitle', () => {
    it('should return null for valid title', () => {
      expect(validateConversationTitle('My Conversation')).toBeNull();
    });

    it('should return null for missing title (not required)', () => {
      expect(validateConversationTitle(undefined)).toBeNull();
    });

    it('should return error for too long title', () => {
      const longTitle = 'a'.repeat(201);
      expect(validateConversationTitle(longTitle)).toBe('title must be at most 200 characters');
    });
  });

  describe('validateConversationType', () => {
    it('should return null for valid type', () => {
      expect(validateConversationType('direct')).toBeNull();
      expect(validateConversationType('group')).toBeNull();
    });

    it('should return null for missing type (not required)', () => {
      expect(validateConversationType(undefined)).toBeNull();
    });

    it('should return error for invalid type', () => {
      expect(validateConversationType('invalid')).toBe('type must be one of: direct, group');
    });
  });

  describe('validateParticipants', () => {
    it('should return null for valid participants', () => {
      expect(validateParticipants(['user1', 'user2'])).toBeNull();
    });

    it('should return null for missing participants (not required)', () => {
      expect(validateParticipants(undefined)).toBeNull();
    });

    it('should return error for too many participants', () => {
      const manyParticipants = Array.from({ length: 101 }, (_, i) => `user${i}`);
      expect(validateParticipants(manyParticipants)).toBe('participants must have at most 100 items');
    });
  });

  describe('validateSearchQuery', () => {
    it('should return null for valid search query', () => {
      expect(validateSearchQuery('hello')).toBeNull();
    });

    it('should return error for missing search query', () => {
      expect(validateSearchQuery(undefined)).toBe('query is required');
    });

    it('should return error for empty search query', () => {
      expect(validateSearchQuery('')).toBe('query must be at least 1 characters');
    });

    it('should return error for too long search query', () => {
      const longQuery = 'a'.repeat(201);
      expect(validateSearchQuery(longQuery)).toBe('query must be at most 200 characters');
    });
  });
});