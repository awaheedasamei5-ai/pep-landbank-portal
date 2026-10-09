/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Extracted verbatim from apps/web/components/issues/issue-detail-widgets/relations/content.tsx
 * (the real TRelationObject type only). The real component is UI the store layer doesn't need and
 * is deferred to the Phase 6 UI pass -- pulling the whole widget tree in here just to satisfy one
 * type import would drag the full issue-detail component tree into the data layer.
 */
import type { TIssueRelationTypes } from "@plane/types";
import type { ReactElement } from "react";

export type TRelationObject = {
  key: TIssueRelationTypes;
  i18n_label: string;
  className: string;
  icon: (size: number) => ReactElement;
  placeholder: string;
};
