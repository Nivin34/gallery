import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  createTemplate,
  deleteTemplateById,
  findTemplateById,
  listAllTemplates,
  listAllUsers,
  toTemplateDTO,
} from '../db.js';
import { canCreateOrUpload, requireAuth, type AuthenticatedRequest } from '../permissions.js';
import { sanitizeRichHtml } from '../sanitize.js';
import type { NoteTemplateDTO } from '../../src/types.js';

export const templateRouter = Router();

const BUILT_IN_TEMPLATES: NoteTemplateDTO[] = [
  {
    id: 'builtin-technical-spec',
    ownerId: 'system',
    ownerName: 'FolioVault Starters',
    name: 'Technical RFC & Architecture Spec',
    description: 'Structured engineering proposal with goals, system design, API contract, and rollout plan.',
    category: 'technical',
    defaultTitle: 'RFC: [Feature / System Name]',
    tags: ['architecture', 'rfc', 'engineering'],
    collectionLayout: 'columns',
    isShared: true,
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contentHtml: `<h2>1. Overview &amp; Objectives</h2><p>Summarize the problem statement, context, and measurable outcomes for this proposal.</p><h2>2. Proposed Architecture</h2><ul><li><strong>Scope:</strong> Describe core components and boundaries.</li><li><strong>Non-Goals:</strong> List what is explicitly out of scope.</li></ul><h2>3. Data Model &amp; API Contract</h2><pre><code class="language-typescript">export interface ServicePayload {
  id: string;
  status: 'draft' | 'active';
  updatedAt: string;
}</code></pre><h2>4. Delivery Milestones</h2><table><tbody><tr><th><p>Phase</p></th><th><p>Deliverable</p></th><th><p>Owner</p></th><th><p>Target Date</p></th></tr><tr><td><p>Phase 1</p></td><td><p>Schema &amp; API endpoints</p></td><td><p>@owner</p></td><td><p>TBD</p></td></tr><tr><td><p>Phase 2</p></td><td><p>UI integration &amp; verification</p></td><td><p>@owner</p></td><td><p>TBD</p></td></tr></tbody></table><h2>5. Open Questions</h2><ul><li>List remaining trade-offs or dependencies requiring team sign-off.</li></ul>`,
  },
  {
    id: 'builtin-meeting-notes',
    ownerId: 'system',
    ownerName: 'FolioVault Starters',
    name: 'Meeting Minutes & Action Tracker',
    description: 'Clean meeting log with attendees, discussion highlights, key decisions, and assigned action items.',
    category: 'meeting',
    defaultTitle: 'Meeting Notes — [Topic / Date]',
    tags: ['meeting', 'decisions', 'actions'],
    collectionLayout: 'grid',
    isShared: true,
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contentHtml: `<h2>Attendees &amp; Context</h2><ul><li><strong>Date:</strong> YYYY-MM-DD</li><li><strong>Participants:</strong> List attendees</li><li><strong>Facilitator:</strong> Name</li></ul><h2>Agenda &amp; Discussion</h2><ol><li>Topic 1 — Key takeaways and context</li><li>Topic 2 — Blockers or open questions</li></ol><h2>Decisions Made</h2><ul><li>Document clear agreements reached during the session.</li></ul><h2>Action Items</h2><table><tbody><tr><th><p>Action Item</p></th><th><p>Owner</p></th><th><p>Due Date</p></th><th><p>Status</p></th></tr><tr><td><p>Follow up on deliverable</p></td><td><p>@name</p></td><td><p>Friday</p></td><td><p>In Progress</p></td></tr></tbody></table>`,
  },
  {
    id: 'builtin-visual-storyboard',
    ownerId: 'system',
    ownerName: 'FolioVault Starters',
    name: 'Visual Storyboard & Image Sequence',
    description: 'Two-column photo essay & design review layout paired with frame-by-frame editorial notes.',
    category: 'collection',
    defaultTitle: 'Visual Storyboard — [Project Title]',
    tags: ['storyboard', 'gallery', 'visual'],
    collectionLayout: 'columns',
    isShared: true,
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contentHtml: `<h2>Creative Brief</h2><p>Describe the visual direction, lighting/composition goals, and intended sequence for the image frames attached above.</p><h2>Sequence &amp; Review Checklist</h2><ul><li>Verify frame order in the Image Collection builder above.</li><li>Add descriptive captions and mark key reference frames below each thumbnail.</li><li>Record stakeholder feedback and final sign-off notes below.</li></ul><blockquote><p>Note: Use the 2-Column or Stack layout in the Image Collection panel to present reference frames cleanly.</p></blockquote>`,
  },
  {
    id: 'builtin-code-walkthrough',
    ownerId: 'system',
    ownerName: 'FolioVault Starters',
    name: 'Code Snippet & Implementation Guide',
    description: 'Developer reference article with prerequisites, runnable code snippet, and verification steps.',
    category: 'editorial',
    defaultTitle: 'Guide: [How to Implement ...]',
    tags: ['guide', 'snippets', 'reference'],
    collectionLayout: 'stack',
    isShared: true,
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contentHtml: `<h2>Summary</h2><p>Explain what this implementation solves and when to use it.</p><h2>Prerequisites</h2><ul><li>Required packages, environment variables, or permissions.</li></ul><h2>Implementation</h2><pre><code class="language-typescript">async function runTask(input: string): Promise&lt;void&gt; {
  // Replace with your implementation snippet
  console.log('Executing:', input);
}</code></pre><h2>Verification Steps</h2><ol><li>Run local checks or test cases.</li><li>Confirm expected output and edge-case handling.</li></ol>`,
  },
];

const createTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Template name must be at least 2 characters.').max(120),
  description: z.string().trim().max(300).default(''),
  category: z.enum(['general', 'technical', 'editorial', 'collection', 'meeting']).default('general'),
  defaultTitle: z.string().trim().max(200).default(''),
  contentHtml: z.string().max(500_000).default(''),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  collectionLayout: z.enum(['grid', 'columns', 'stack']).default('grid'),
  isShared: z.boolean().default(false),
});

templateRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all'; // all | mine | shared | builtin

    const [customTemplates, allUsers] = await Promise.all([listAllTemplates(), listAllUsers()]);
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

    const visibleCustom = customTemplates
      .filter((t) => t.ownerId === user.id || t.isShared || user.role === 'admin')
      .map((t) => toTemplateDTO(t, userMap.get(t.ownerId) || 'Unknown'));

    let combined: NoteTemplateDTO[] = [...visibleCustom, ...BUILT_IN_TEMPLATES];

    if (scope === 'mine') {
      combined = combined.filter((t) => !t.isBuiltIn && t.ownerId === user.id);
    } else if (scope === 'shared') {
      combined = combined.filter((t) => !t.isBuiltIn && t.isShared);
    } else if (scope === 'builtin') {
      combined = combined.filter((t) => t.isBuiltIn);
    }

    if (search) {
      combined = combined.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description.toLowerCase().includes(search) ||
          t.category.toLowerCase().includes(search) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search))
      );
    }

    res.json({ items: combined });
  } catch (err) {
    console.error('[FolioVault] Error listing templates:', err);
    res.status(500).json({ error: 'Unable to load templates.' });
  }
});

templateRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    if (!canCreateOrUpload(user)) {
      res.status(403).json({
        error: 'Your current permission tier (View Only) does not allow saving templates.',
      });
      return;
    }

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid template data.' });
      return;
    }

    const now = new Date().toISOString();
    const entity = await createTemplate({
      id: crypto.randomUUID(),
      ownerId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      defaultTitle: parsed.data.defaultTitle,
      contentHtml: sanitizeRichHtml(parsed.data.contentHtml),
      tags: parsed.data.tags,
      collectionLayout: parsed.data.collectionLayout,
      isShared: parsed.data.isShared,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ template: toTemplateDTO(entity, user.name) });
  } catch (err) {
    console.error('[FolioVault] Error saving template:', err);
    res.status(500).json({ error: 'Unable to save template.' });
  }
});

templateRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);

    if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) {
      res.status(400).json({ error: 'Built-in starter templates cannot be deleted.' });
      return;
    }

    const tpl = await findTemplateById(id);
    if (!tpl) {
      res.status(404).json({ error: 'Template not found.' });
      return;
    }

    if (tpl.ownerId !== user.id && user.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to delete this template.' });
      return;
    }

    await deleteTemplateById(tpl.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[FolioVault] Error deleting template:', err);
    res.status(500).json({ error: 'Unable to delete template.' });
  }
});
