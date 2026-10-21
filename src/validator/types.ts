export interface RuleResult { id: string; name: string; passed: boolean; checked: number; failureCount: number; examples: string[] }
export interface ValidationReport {
  datasetVersion: string; passed: boolean; integrityErrors: string[];
  rowCounts: Record<string,number>; rules: RuleResult[];
}
export class RuleCheck {
  private checks = 0;
  private failures = 0;
  private readonly examples: string[] = [];
  constructor(private readonly id: string, private readonly name: string) {}
  expect(condition: boolean, detail: string): void {
    this.checks++;
    if (!condition) { this.failures++; if (this.examples.length < 5) this.examples.push(detail); }
  }
  result(): RuleResult {
    return {id:this.id,name:this.name,passed:this.failures===0,checked:this.checks,failureCount:this.failures,examples:this.examples};
  }
}
