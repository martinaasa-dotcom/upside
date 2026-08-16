-- Circles show a member's real portfolios unless they turn one off.
-- Classrooms stay paper-only. Class homework sheets stay out of circles.

alter table public.portfell_community_join_requests
  add column if not exists share_portfolio_ids uuid[];

comment on column public.portfell_community_join_requests.share_portfolio_ids is
  'Portfolios the requester wants this public circle to see if approved. Null means share all they own. Empty means share none.';

insert into public.portfell_community_portfolios (community_id, portfolio_id, label)
select distinct cm.community_id, po.portfolio_id, p.name
from public.portfell_community_members cm
join public.portfell_communities c on c.id = cm.community_id
join public.portfell_portfolio_owners po on po.user_id = cm.user_id
join public.portfell_portfolios p on p.id = po.portfolio_id
where coalesce(c.kind, 'circle') is distinct from 'classroom'
  and p.classroom_community_id is null
on conflict do nothing;
