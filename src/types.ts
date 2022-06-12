import { SorbetOptions } from '@basketry/sorbet/lib/types';

export type SorbetValidatorOptions = {
  basketry?: {
    subfolder?: string;
  };
  sorbet?: SorbetOptions & {
    runtime?: boolean;
    rubocopDisable?: string[];
  };
};
