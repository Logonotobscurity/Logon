import {
  SpanStatusCode,
  trace,
  type AttributeValue
} from "@opentelemetry/api";

const tracer = trace.getTracer("@log_on/os-kernel");

export interface ExecutionTraceAttributes {
  tenantId?: string;
  executionId: string;
  agentId?: string;
  agentVersion?: string;
  status?: string;
}

export async function withExecutionSpan<T>(
  name: string,
  attributes: ExecutionTraceAttributes,
  operation: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    const spanAttributes: Record<string, AttributeValue> = {
      "logon.execution_id": attributes.executionId
    };

    if (attributes.tenantId) spanAttributes["logon.tenant_id"] = attributes.tenantId;

    if (attributes.agentId) spanAttributes["logon.agent_id"] = attributes.agentId;
    if (attributes.agentVersion) spanAttributes["logon.agent_version"] = attributes.agentVersion;
    if (attributes.status) spanAttributes["logon.execution_status"] = attributes.status;

    span.setAttributes(spanAttributes);

    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
