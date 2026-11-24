// Pro feature: ask OpenAI to break a task into small steps and save them in
// the task_steps table.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { SUPABASE_PUBLISHABLE_KEY } from "../_shared/supabaseKeys.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_STEPS = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { task_id } = await req.json();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    if (!task_id) throw new Error("No task_id given");

    // Acts as the signed-in user, so Row Level Security applies.
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    // Only the Pro plan may use this feature.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("subscription_plan")
      .eq("user_id", user.id)
      .single();
    if (profileError) throw profileError;
    if (profile.subscription_plan !== "pro") {
      throw new Error(
        "AI task breakdown is a Pro feature. Upgrade to Pro to use it."
      );
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("task_id, title, description")
      .eq("task_id", task_id)
      .single();
    if (taskError) throw taskError;

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Break this to-do list task into 3 to ${MAX_STEPS} small, concrete steps, in the order to do them.

Task title: "${task.title}"
Task description: "${task.description ?? ""}"

Reply with JSON only, in this form: {"steps": ["first step", "second step"]}
Each step is a short sentence of at most 100 characters.`,
        },
      ],
    });

    let steps: string[] = [];
    try {
      const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
      if (Array.isArray(parsed.steps)) steps = parsed.steps;
    } catch {
      // Not valid JSON: handled below.
    }
    steps = steps
      .filter((s) => typeof s === "string")
      .map((s) => s.trim().slice(0, 200))
      .filter((s) => s.length > 0)
      .slice(0, MAX_STEPS);
    if (steps.length === 0) {
      throw new Error("The AI did not return any steps. Try again.");
    }

    // Put the new steps after the ones already there.
    const { data: last } = await supabase
      .from("task_steps")
      .select("position")
      .eq("task_id", task_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const start = (last?.position ?? -1) + 1;

    const { data: saved, error: insertError } = await supabase
      .from("task_steps")
      .insert(
        steps.map((step_text, i) => ({
          task_id,
          user_id: user.id,
          step_text,
          position: start + i,
          ai_generated: true,
        }))
      )
      .select();
    if (insertError) throw insertError;

    console.log(`✨ Saved ${saved.length} AI steps for task ${task_id}`);
    return json({ steps: saved });
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    console.error("Error in break-down-task:", message);
    return json({ error: message }, 400);
  }
});
