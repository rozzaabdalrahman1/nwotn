-- Secure quiz grading: the client never decides the score.
create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); total int:=0; score int:=0; q record; chosen uuid; correct boolean;
begin
 if uid is null then raise exception 'Not authenticated'; end if;
 for q in select id,points from public.questions where quiz_id=p_quiz_id loop
   total:=total+q.points;
   chosen:=nullif(p_answers->>q.id::text,'')::uuid;
   select qc.is_correct into correct from public.question_choices qc where qc.id=chosen and qc.question_id=q.id;
   if coalesce(correct,false) then score:=score+q.points; end if;
 end loop;
 insert into public.quiz_attempts(quiz_id,student_id,score,total_points) values(p_quiz_id,uid,case when total>0 then round(score::numeric/total*100,2) else 0 end,total);
 return jsonb_build_object('score',case when total>0 then round(score::numeric/total*100,2) else 0 end,'points',score,'total_points',total);
end;
$$;
revoke all on function public.submit_quiz_attempt(uuid,jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid,jsonb) to authenticated;
