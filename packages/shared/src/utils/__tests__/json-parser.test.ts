import { parseLLMJSON } from '../json-parser';

describe('parseLLMJSON', () => {
  it('should parse valid JSON string', () => {
    const result = parseLLMJSON('{"name": "test", "value": 123}');
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  it('should parse JSON from markdown code block', () => {
    const input = '```json\n{"name": "test"}\n```';
    const result = parseLLMJSON(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON from generic code block', () => {
    const input = '```\n{"name": "test"}\n```';
    const result = parseLLMJSON(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('should extract JSON object from text', () => {
    const input = 'Here is the result: {"name": "test"} and more text';
    const result = parseLLMJSON(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('should extract JSON array from text', () => {
    const input = 'Here is the result: [1, 2, 3] and more text';
    const result = parseLLMJSON(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should throw error for invalid JSON', () => {
    expect(() => parseLLMJSON('not json at all')).toThrow('Failed to parse JSON from LLM response');
  });

  it('should use custom label in error message', () => {
    expect(() => parseLLMJSON('invalid', 'custom label')).toThrow('Failed to parse JSON from custom label');
  });
});