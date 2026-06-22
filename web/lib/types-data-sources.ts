// Pure types for the data-source tracking system (dim_data_sources).
// Each dashboard card consumes this via <SourceBadge> to display provenance.
// Kept free of server-only imports so client components can pull from here.

export type SourceType = 'AUTO' | 'EXCEL_SEED' | 'MANUAL';

export type DataSourceRow = {
  dataset_key: string;
  display_name: string;
  current_source: SourceType;
  target_source: 'AUTO' | 'MANUAL';
  pdf_section: string | null;
  excel_seed_path: string | null;
  excel_seed_periodo: string | null;
  last_loaded_at: string | null;
  last_loaded_by: string | null;
  migration_plan: string | null;
  notes: string | null;
};
