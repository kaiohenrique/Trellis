import { useState } from 'react';
import type { CommentTreeNode } from '@kb/shared';
import { useComments, useCommentMutations } from '../hooks/useComments';
import { MarkdownRenderer } from './MarkdownRenderer';

interface Props {
  nodeId: string;
}

const STORAGE_KEY = 'kb.author';

function getStoredAuthor(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}
function setStoredAuthor(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function CommentThread({ nodeId }: Props) {
  const { data: comments, isLoading } = useComments(nodeId);
  const { create } = useCommentMutations(nodeId);
  const [author, setAuthor] = useState(getStoredAuthor());
  const [body, setBody] = useState('');

  const submit = async () => {
    if (!body.trim()) return;
    if (author.trim()) setStoredAuthor(author.trim());
    await create.mutateAsync({ author: author.trim() || 'anonymous', body });
    setBody('');
  };

  return (
    <div className="comment-thread">
      <h3>Comments</h3>
      {isLoading && <div className="empty">Loading…</div>}
      {comments && comments.length === 0 && <div className="empty">No comments yet.</div>}
      {comments?.map((c) => (
        <CommentItem key={c.id} comment={c} nodeId={nodeId} />
      ))}
      <div className="card" style={{ marginTop: 16 }}>
        <input
          type="text"
          placeholder="Your name"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <textarea
          placeholder="Add a comment (markdown supported)"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ comment, nodeId }: { comment: CommentTreeNode; nodeId: string }) {
  const { create, update, remove } = useCommentMutations(nodeId);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editBody, setEditBody] = useState(comment.body);
  const author = getStoredAuthor();
  const isAuthor = author && author === comment.author;

  const submitReply = async () => {
    if (!replyBody.trim()) return;
    await create.mutateAsync({
      author: author || 'anonymous',
      body: replyBody,
      parent_id: comment.id,
    });
    setReplyBody('');
    setReplying(false);
  };
  const submitEdit = async () => {
    if (!editBody.trim()) return;
    await update.mutateAsync({ id: comment.id, body: editBody });
    setEditing(false);
  };
  const submitDelete = async () => {
    if (!confirm('Delete this comment?')) return;
    await remove.mutateAsync(comment.id);
  };

  return (
    <div className="comment">
      <div>
        <span className="author">{comment.author}</span>
        <span className="time">{timeAgo(comment.created_at)}</span>
      </div>
      {editing ? (
        <div>
          <textarea rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <button className="primary" onClick={submitEdit}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <MarkdownRenderer body={comment.body} inline />
      )}
      <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 12 }}>
        <button onClick={() => setReplying((r) => !r)} style={{ padding: '2px 6px', fontSize: 11 }}>
          Reply
        </button>
        {isAuthor && !editing && (
          <>
            <button onClick={() => setEditing(true)} style={{ padding: '2px 6px', fontSize: 11 }}>
              Edit
            </button>
            <button onClick={submitDelete} className="danger" style={{ padding: '2px 6px', fontSize: 11 }}>
              Delete
            </button>
          </>
        )}
      </div>
      {replying && (
        <div className="composer">
          <textarea
            rows={2}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Reply…"
          />
          <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
            <button className="primary" onClick={submitReply}>Reply</button>
            <button onClick={() => setReplying(false)}>Cancel</button>
          </div>
        </div>
      )}
      {comment.replies.length > 0 && (
        <div className="replies">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} nodeId={nodeId} />
          ))}
        </div>
      )}
    </div>
  );
}
