-- Improvements: a third plan ("pro") and a checklist of steps for each task.

-- 1. Allow the new plan name in profiles.subscription_plan.
alter table public.profiles drop constraint if exists profiles_subscription_plan_check;
alter table public.profiles add constraint profiles_subscription_plan_check
  check (subscription_plan in ('free', 'premium', 'pro'));

-- 2. Set the monthly task limit for each plan whenever the plan changes:
--    free = 100, premium = 10,000, pro = 100,000.
create or replace function update_task_limit_on_plan_change()
returns trigger
security definer
set search_path = public
as $$
begin
  if new.subscription_plan is distinct from old.subscription_plan then
    new.tasks_limit := case new.subscription_plan
      when 'pro' then 100000
      when 'premium' then 10000
      else 100
    end;
  end if;
  return new;
end;
$$ language plpgsql;

-- 3. NEW TABLE: the steps (checklist) of a task. Users can add steps by hand;
--    Pro users can also have OpenAI write them (ai_generated = true).
create table public.task_steps (
  step_id uuid default gen_random_uuid() primary key,
  task_id uuid not null references public.tasks(task_id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  step_text text not null check (char_length(step_text) between 1 and 200),
  done boolean not null default false,
  position integer not null default 0,
  ai_generated boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create index idx_task_steps_task on public.task_steps(task_id, position);

alter table public.task_steps enable row level security;

-- Users can read, add, change and delete only their own steps.
create policy "Users can CRUD own task steps"
on public.task_steps for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
