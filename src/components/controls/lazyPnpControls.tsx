import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import * as React from 'react';

/*
 * The PnP reusable controls are large (they bundle their own Fluent UI and PnPjs copies, and Quill for the rich
 * text editor). They are split into separate chunks and loaded only when an editable control actually needs them
 * (Rendszerterv §15, NF-04). Enum values are duplicated as numbers so that no static import pulls them in.
 */

/** PnP `PrincipalType` values. */
export const PNP_PRINCIPAL_TYPE: Record<string, number> = { User: 1, DistributionList: 2, SecurityGroup: 4, SharePointGroup: 8 };

/** PnP `TimeConvention` values. */
export const PNP_TIME_CONVENTION: { Hours12: number; Hours24: number } = { Hours12: 1, Hours24: 2 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the props are typed at the call sites
type AnyProps = any;

export const LazyPeoplePicker: React.LazyExoticComponent<React.ComponentType<AnyProps>> = React.lazy(() =>
  import(/* webpackChunkName: 'pnp-peoplepicker' */ '@pnp/spfx-controls-react/lib/PeoplePicker').then((m) => ({
    default: m.PeoplePicker as unknown as React.ComponentType<AnyProps>
  }))
);

export const LazyRichText: React.LazyExoticComponent<React.ComponentType<AnyProps>> = React.lazy(() =>
  import(/* webpackChunkName: 'pnp-richtext' */ '@pnp/spfx-controls-react/lib/RichText').then((m) => ({
    default: m.RichText as unknown as React.ComponentType<AnyProps>
  }))
);

export const LazyDateTimePicker: React.LazyExoticComponent<React.ComponentType<AnyProps>> = React.lazy(() =>
  import(/* webpackChunkName: 'pnp-datetimepicker' */ '@pnp/spfx-controls-react/lib/DateTimePicker').then((m) => ({
    default: m.DateTimePicker as unknown as React.ComponentType<AnyProps>
  }))
);

/** Suspense boundary with a small spinner while a control chunk loads. */
export const LazyBoundary: React.FC = ({ children }) => (
  <React.Suspense fallback={<Spinner size={SpinnerSize.small} />}>{children}</React.Suspense>
);
