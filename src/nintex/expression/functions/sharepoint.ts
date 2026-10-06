import { toText } from '../values';
import { aliasFunction, registerFunction } from './registry';

/**
 * True when the current user is a member of the named SharePoint group.
 * Group titles are preloaded into the evaluation context (synchronous evaluation).
 *
 * SECURITY: this is a UI-level restriction only (hides/disables controls). It is NOT a security boundary;
 * list permissions in SharePoint are authoritative.
 */
registerFunction(
  'fn-IsMemberOfGroup',
  (args, ctx) => {
    const group = toText(args[0]).trim().toLowerCase();
    if (!group) return false;
    return ctx.currentUserGroups.some((g) => g.trim().toLowerCase() === group);
  },
  { minArgs: 1, maxArgs: 1 }
);
aliasFunction('fn-IsMemberOfGroup', 'isMemberOfGroup');
