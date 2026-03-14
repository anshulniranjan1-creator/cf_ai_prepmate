import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, callable, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  waitForMcpConnections = true;

  onStart() {
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string, host: string) {
    return await this.addMcpServer(name, url, { callbackHost: host });
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are PrepMate, an AI-powered interview preparation coach. Your job is to help users practice for job interviews.

BEHAVIOR:
- When a user tells you what role or company they are preparing for, remember it and tailor questions accordingly.
- Ask one interview question at a time. Wait for the user to answer before asking the next one.
- After the user answers, give constructive feedback: what was strong, what could be improved, and a sample stronger answer.
- Score each answer on a scale of 1-10 with a brief justification.
- Track how many questions have been asked in this session.
- Mix question types: behavioral (STAR method), technical, situational, and culture-fit.
- If the user says "summary" or "how did I do", give an overall performance summary with strengths, areas to improve, and a final score.
- Be encouraging but honest. The goal is to help the user improve.
- If the user hasn't specified a role, start by asking what position they're preparing for.

MEMORY:
- You have access to the full conversation history. Use it to avoid repeating questions and to reference the user's previous answers when giving feedback.
- If the user has answered multiple questions, note patterns in their responses (e.g., "You tend to give short answers — try adding more specific examples").

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a practice session or reminder, use the schedule tool.`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        ...mcpTools,

        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time for scheduling.",
          inputSchema: z.object({})
        }),

        scheduleTask: tool({
          description:
            "Schedule a practice session or reminder. Use this when the user asks to be reminded or wants to schedule a follow-up session.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description);
              return `Reminder scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all scheduled practice sessions and reminders",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled sessions found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled session by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Session ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    console.log(`Executing scheduled task: ${description}`);
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
