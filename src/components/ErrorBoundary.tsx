import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import * as React from 'react';

export interface ErrorBoundaryProps {
  title: string;
  backText: string;
  backUrl?: string;
  onError?(error: Error): void;
}

interface ErrorBoundaryState {
  error?: Error;
}

/** Keeps a rendering error from breaking the SharePoint page (Rendszerterv NF-09). */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error): void {
    if (this.props.onError) this.props.onError(error);
  }

  public render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        <div>{this.props.title}</div>
        <div>{this.state.error.message}</div>
        {this.props.backUrl && <Link href={this.props.backUrl}>{this.props.backText}</Link>}
      </MessageBar>
    );
  }
}
