import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSafetyDialog } from './chat-safety-dialog';
const state = vi.hoisted(() => ({
  blocked: { data: { items: [{userId:'other',displayName:'상대'}] }, isPending:false,isError:false,refetch:vi.fn() },
  block: { mutate:vi.fn(),isPending:false,error:null as Error|null },
  unblock: { mutate:vi.fn(),isPending:false,error:null as Error|null },
  report: { mutate:vi.fn(),isPending:false,error:null as Error|null,data:undefined },
}));
vi.mock('@/hooks/use-chat-safety',()=>({useChatSafety:()=>state}));
vi.mock('next/navigation',()=>({usePathname:()=>'/chat/room',useSearchParams:()=>new URLSearchParams('from=notifications')}));
describe('chat safety controls',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.block.error=null;state.report.error=null;state.blocked.isError=false;});
 it('requires an explicit second confirmation before blocking',()=>{
  render(<ChatSafetyDialog roomId="room" target={{id:'message',label:'상대'}} onClose={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'이 사용자 차단'}));
  expect(state.block.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'이 사용자 차단 확인'}));
  expect(state.block.mutate).toHaveBeenCalledWith('message',expect.any(Object));
 });
 it('links the receipt to the inquiry with this room as the back target',()=>{
  (state.report as { data: unknown }).data={inquiryId:'inq-1'};
  render(<ChatSafetyDialog roomId="room" target={{id:'message',label:'상대'}} onClose={()=>{}}/>);
  expect(screen.getByRole('link',{name:'처리 내역 보기'})).toHaveAttribute('href',`/my/inquiries/inq-1?from=${encodeURIComponent('/chat/room?from=notifications')}`);
  (state.report as { data: unknown }).data=undefined;
 });
 it('keeps a failed report open and never shows a fake receipt',()=>{
  state.report.error=new Error('접수 서버 연결 실패');
  render(<ChatSafetyDialog roomId="room" target={{id:'message',label:'상대'}} onClose={()=>{}}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('접수 서버 연결 실패');
  expect(screen.queryByRole('link',{name:'처리 내역 보기'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'신고 접수'})).toBeEnabled();
 });
 it('shows retry rather than an empty successful block list on failure',()=>{
  state.blocked.isError=true;
  render(<ChatSafetyDialog roomId="room" target={null} onClose={()=>{}}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('차단 목록을 불러오지 못했어요');
  fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));
  expect(state.blocked.refetch).toHaveBeenCalled();
 });
});
