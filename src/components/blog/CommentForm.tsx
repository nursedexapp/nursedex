"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitComment } from "@/lib/comments/actions";
import { PendingButton } from "@/components/ui/pending-button";

export function CommentForm({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setErrors({});
    startTransition(async () => {
      const res = await submitComment({
        post_id: postId,
        author_name: name,
        author_email: email,
        body,
        website,
      });
      if (!res.success) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-soft-black flex items-center gap-2 text-sm">
        <CheckCircle2 className="text-teal size-5" />
        Thanks! Your comment is awaiting review.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="c-name">Name</Label>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1"
          />
          {errors.author_name && (
            <p className="text-error mt-1 text-xs">{errors.author_name}</p>
          )}
        </div>
        <div>
          <Label htmlFor="c-email">Email (not published)</Label>
          <Input
            id="c-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1"
          />
          {errors.author_email && (
            <p className="text-error mt-1 text-xs">{errors.author_email}</p>
          )}
        </div>
      </div>
      <div>
        <Label htmlFor="c-body">Comment</Label>
        <Textarea
          id="c-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          required
          className="mt-1"
        />
        {errors.body && (
          <p className="text-error mt-1 text-xs">{errors.body}</p>
        )}
      </div>
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
      />
      {/* wait, not retry (#443 phase 5): a second fire posts a second
          comment. */}
      <PendingButton
        pending={pending}
        mode="wait"
        type="submit"
        idleLabel="Post comment"
        workingLabel="Posting..."
        slowLabel="Still posting..."
        stalledMessage="This is still processing. Refresh to check whether your comment went through before posting it again."
      />
      <p className="text-soft-black-light text-xs">
        Comments are reviewed before they appear.
      </p>
    </form>
  );
}
