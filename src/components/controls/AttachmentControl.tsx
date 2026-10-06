import { DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Link } from '@fluentui/react/lib/Link';
import * as React from 'react';
import type { AttachmentControl as AttachmentDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { issueMessage } from '../messages';
import type { IControlProps } from './types';

/** List, upload and delete item attachments (uploads happen after the item is saved, Rendszerterv F-10). */
export const AttachmentControl: React.FC<IControlProps<AttachmentDefinition>> = (props) => {
  const { def, mode, disabled, inputId, labelledBy, describedBy } = props;
  const { store, strings, services } = useFormContext();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = React.useState<string[]>([]);
  const attachments = store.attachments;
  const existing = attachments.existing.filter((a) => attachments.removed.indexOf(a.fileName) < 0);
  const editable = mode !== 'Display' && !disabled;

  const onFiles = (files: FileList | null): void => {
    if (!files || !files.length) return;
    const result = store.addAttachments(def.id, Array.prototype.slice.call(files) as File[]);
    setRejected(result.map((r) => `${r.fileName}: ${issueMessage(r.issue, strings)}`));
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div id={inputId} className="nf-attachments" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {!existing.length && !attachments.added.length && <div className="nf-attachments-empty">{strings.NoAttachments}</div>}
      <ul className="nf-attachments-list">
        {existing.map((a) => (
          <li key={`e-${a.fileName}`}>
            <Link href={services.rewriteUrl(a.serverRelativeUrl)} target="_blank" rel="noopener noreferrer">
              {a.fileName}
            </Link>
            {editable && (
              <IconButton
                iconProps={{ iconName: 'Delete' }}
                title={strings.RemoveAttachment}
                ariaLabel={`${strings.RemoveAttachment}: ${a.fileName}`}
                onClick={() => store.removeAttachment(def.id, a.fileName)}
              />
            )}
          </li>
        ))}
        {attachments.added.map((f) => (
          <li key={`n-${f.name}`}>
            <span>{f.name}</span> <span className="nf-attachments-pending">{strings.PendingUpload}</span>
            {editable && (
              <IconButton
                iconProps={{ iconName: 'Cancel' }}
                title={strings.RemoveAttachment}
                ariaLabel={`${strings.RemoveAttachment}: ${f.name}`}
                onClick={() => store.removeAttachment(def.id, f.name)}
              />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept={def.whitelist.length ? def.whitelist.map((e) => `.${e}`).join(',') : undefined}
            onChange={(e) => onFiles(e.target.files)}
          />
          <DefaultButton iconProps={{ iconName: 'Attach' }} text={strings.AttachFile} onClick={() => fileInput.current && fileInput.current.click()} />
        </>
      )}
      {rejected.length > 0 && (
        <div className="nf-validation-error" role="alert">
          {rejected.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
    </div>
  );
};
