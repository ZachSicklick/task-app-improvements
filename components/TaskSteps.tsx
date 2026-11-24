"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Database } from "@/lib/database.types";

type Step = Database["public"]["Tables"]["task_steps"]["Row"];

interface TaskStepsProps {
  taskId: string;
  userId: string;
  plan: string | null;
  accessToken: string | undefined;
}

// A checklist of steps for one task. Anyone can add steps by hand; people on
// the Pro plan can also have OpenAI write them.
export function TaskSteps({ taskId, userId, plan, accessToken }: TaskStepsProps) {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const [steps, setSteps] = useState<Step[]>([]);
  const [newStep, setNewStep] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const loadSteps = async () => {
    const { data, error } = await supabase
      .from("task_steps")
      .select("*")
      .eq("task_id", taskId)
      .order("position", { ascending: true });
    if (error) {
      setMessage(error.message);
      return;
    }
    setSteps(data || []);
  };

  useEffect(() => {
    loadSteps();
  }, [taskId]);

  const addStep = async () => {
    const text = newStep.trim();
    if (!text) return;
    setMessage(null);
    const nextPosition =
      steps.length > 0 ? Math.max(...steps.map((s) => s.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("task_steps")
      .insert({
        task_id: taskId,
        user_id: userId,
        step_text: text.slice(0, 200),
        position: nextPosition,
      })
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    setSteps([...steps, data]);
    setNewStep("");
  };

  const toggleStep = async (step: Step, done: boolean) => {
    const { error } = await supabase
      .from("task_steps")
      .update({ done })
      .eq("step_id", step.step_id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSteps(steps.map((s) => (s.step_id === step.step_id ? { ...s, done } : s)));
  };

  const deleteStep = async (step: Step) => {
    const { error } = await supabase
      .from("task_steps")
      .delete()
      .eq("step_id", step.step_id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSteps(steps.filter((s) => s.step_id !== step.step_id));
  };

  const breakDownWithAI = async () => {
    setMessage(null);
    setIsThinking(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/break-down-task`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ task_id: taskId }),
        }
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      await loadSteps();
    } catch (error: any) {
      setMessage(error.message || "Could not break down the task");
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="grid w-full items-center gap-1.5">
      <Label>Steps</Label>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.step_id} className="flex items-center space-x-2">
            <Checkbox
              checked={step.done}
              onCheckedChange={(checked) =>
                toggleStep(step, checked as boolean)
              }
            />
            <span
              className={
                step.done ? "flex-1 text-sm line-through text-gray-400" : "flex-1 text-sm"
              }
            >
              {step.step_text}
              {step.ai_generated && (
                <Sparkles className="inline ml-1 h-3 w-3 text-purple-500" />
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => deleteStep(step)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete step</span>
            </Button>
          </div>
        ))}
        <div className="flex space-x-2">
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
            placeholder="Add a step"
            maxLength={200}
          />
          <Button type="button" variant="outline" onClick={addStep}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        {plan === "pro" ? (
          <Button
            type="button"
            variant="outline"
            onClick={breakDownWithAI}
            disabled={isThinking}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isThinking ? "Thinking..." : "Break down with AI (Pro)"}
          </Button>
        ) : (
          <p className="text-xs text-gray-500">
            Upgrade to Pro on your profile page to have AI write the steps for
            you.
          </p>
        )}
        {message && <div className="text-red-500 text-sm">{message}</div>}
      </div>
    </div>
  );
}
