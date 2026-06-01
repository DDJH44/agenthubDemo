import { parseMentions } from '../mention-parser';

describe('parseMentions', () => {
  it('should extract single agent mention', () => {
    const result = parseMentions('@planner please plan this task');
    expect(result.agents).toEqual(['planner']);
    expect(result.cleanText).toBe('please plan this task');
    expect(result.isAllAgents).toBe(false);
  });

  it('should extract multiple agent mentions', () => {
    const result = parseMentions('@planner @worker build a website');
    expect(result.agents).toEqual(['planner', 'worker']);
    expect(result.cleanText).toBe('build a website');
    expect(result.isAllAgents).toBe(false);
  });

  it('should handle @all mention', () => {
    const result = parseMentions('@all create a todo app');
    expect(result.isAllAgents).toBe(true);
    expect(result.cleanText).toBe('create a todo app');
  });

  it('should handle text without mentions', () => {
    const result = parseMentions('just a regular message');
    expect(result.agents).toEqual([]);
    expect(result.cleanText).toBe('just a regular message');
    expect(result.isAllAgents).toBe(false);
  });

  it('should handle empty string', () => {
    const result = parseMentions('');
    expect(result.agents).toEqual([]);
    expect(result.cleanText).toBe('');
    expect(result.isAllAgents).toBe(false);
  });

  it('should extract mentions at different positions', () => {
    const result = parseMentions('hello @worker and @critic');
    expect(result.agents).toEqual(['worker', 'critic']);
    expect(result.isAllAgents).toBe(false);
  });
});