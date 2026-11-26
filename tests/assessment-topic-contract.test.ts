import { describe, it, expect } from 'vitest';
import * as topic from '../packages/domain/src/assessment-topic.js';
describe('topic proposals', () => {
  it('rejects incomplete model answers, counts and rubric instead of repairing', () => {
    const input = topic.parseTopicRequest({ topic: 'Cedar workshop safety' });
    const valid = topic.syntheticTopicProposal(input);
    for (const change of [
      (p: any) => p.questions.pop(),
      (p: any) => {
        p.rubric = null;
      },
      (p: any) => {
        delete p.questions[0].correct_choice_reference;
      },
      (p: any) => {
        delete p.questions[1].suggested_answer;
      },
      (p: any) => {
        p.questions = p.questions.map(() => ({
          ...p.questions[0],
          reference: 'q' + Math.random().toString().slice(2),
        }));
      },
    ]) {
      const value = structuredClone(valid);
      change(value);
      expect(() => topic.validateTopicProposal(input, value)).toThrow();
    }
    for (const invalid of [
      { topic: 'abc', count: 31 },
      { topic: 'abc', synthetic: true },
      { topic: '<script>' },
      { topic: 'abc', language: 'French' },
    ])
      expect(() => topic.parseTopicRequest(invalid)).toThrow();
  });
  it('defaults to five mixed English questions and validates the deterministic synthetic proposal', () => {
    expect(typeof topic.parseTopicRequest).toBe('function');
    const input = topic.parseTopicRequest({ topic: 'Cedar workshop safety' });
    expect(input).toEqual({
      topic: 'Cedar workshop safety',
      count: 5,
      difficulty: 'medium',
      language: 'English',
      types: 'mixed',
    });
    const proposal = topic.validateTopicProposal(input, topic.syntheticTopicProposal(input));
    expect(proposal.questions).toHaveLength(5);
    expect(new Set(proposal.questions.map((q) => q.type)).size).toBe(2);
    expect(proposal.rubric).not.toBeNull();
  });
});
