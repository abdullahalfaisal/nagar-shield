/**
 * Supabase database types — hand-maintained against the live canonical schema.
 *
 * Source of truth: `supabase/migrations/20261105000001_initial_schema.sql` …
 * `20261105000023_contacts_phone_constraint.sql`.
 * Regenerate and diff with:
 *   npx supabase gen types typescript --local --schema public
 *
 * Two schema facts this file encodes that a naive port would get wrong:
 *
 *   * `reports.area_hierarchy` is a **jsonb document**, not four `area_*`
 *     columns. The four levels are always read and written together.
 *   * The public `alerts_feed` view **omits `author_id` entirely** (FR-DATA-3 /
 *     FR-NG-5). The column is absent at the view level, not nulled — a named
 *     null column would still leak the field name.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type GenericRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          phone: string
          email: string
          full_name: string | null
          alternate_phone: string | null
          role: Database['public']['Enums']['app_role']
          locale: Database['public']['Enums']['locale']
          theme: Database['public']['Enums']['theme']
          biometric_opt_in: boolean
          biometric_fail_count: number
          biometric_fail_until: string | null
          disabled_at: string | null
          deleted_at: string | null
          pii_purged_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          auth_user_id?: string | null
          phone: string
          email: string
          full_name?: string | null
          alternate_phone?: string | null
          role?: Database['public']['Enums']['app_role']
          locale?: Database['public']['Enums']['locale']
          theme?: Database['public']['Enums']['theme']
          biometric_opt_in?: boolean
          biometric_fail_count?: number
          biometric_fail_until?: string | null
          disabled_at?: string | null
          deleted_at?: string | null
          pii_purged_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: GenericRelationship[]
      }
      contacts: {
        Row: {
          id: string
          user_id: string
          name: string
          phone: string
          is_primary: boolean
          group_name: Database['public']['Enums']['contact_group']
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          /**
           * Optional on insert: the column carries a database default of
           * `auth.uid()` (migration 022), so the owner is set by the database
           * and the client never names one. It stays required on `Row` — the
           * value is always present once the row exists.
           */
          user_id?: string
          name: string
          phone: string
          is_primary?: boolean
          group_name?: Database['public']['Enums']['contact_group']
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
        Relationships: GenericRelationship[]
      }
      reports: {
        Row: {
          id: string
          author_id: string
          client_request_id: string
          lat: number
          lng: number
          captured_at: string
          description: string | null
          category: Database['public']['Enums']['report_category'] | null
          public_visibility: Database['public']['Enums']['public_visibility']
          moderation_status: Database['public']['Enums']['moderation_status']
          hide_reason: Database['public']['Enums']['hide_reason'] | null
          area_hierarchy: Json
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          client_request_id: string
          lat: number
          lng: number
          captured_at?: string
          description?: string | null
          category?: Database['public']['Enums']['report_category'] | null
          public_visibility?: Database['public']['Enums']['public_visibility']
          moderation_status?: Database['public']['Enums']['moderation_status']
          hide_reason?: Database['public']['Enums']['hide_reason'] | null
          area_hierarchy?: Json
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['reports']['Insert']>
        Relationships: GenericRelationship[]
      }
      report_media: {
        Row: {
          id: string
          report_id: string
          storage_path: string
          media_type: Database['public']['Enums']['media_type']
          byte_size: number
          duration_seconds: number | null
          width: number | null
          height: number | null
          created_at: string
          purged_at: string | null
        }
        Insert: {
          id?: string
          report_id: string
          storage_path: string
          media_type: Database['public']['Enums']['media_type']
          byte_size: number
          duration_seconds?: number | null
          width?: number | null
          height?: number | null
          created_at?: string
          purged_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['report_media']['Insert']>
        Relationships: GenericRelationship[]
      }
      flags: {
        Row: {
          id: string
          report_id: string
          flagger_id: string
          reason: Database['public']['Enums']['flag_reason']
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          flagger_id: string
          reason: Database['public']['Enums']['flag_reason']
          created_at?: string
        }
        Update: never
        Relationships: GenericRelationship[]
      }
      moderation_actions: {
        Row: {
          id: string
          report_id: string | null
          moderator_id: string
          target_user_id: string | null
          decision: Database['public']['Enums']['moderation_decision']
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          report_id?: string | null
          moderator_id: string
          target_user_id?: string | null
          decision: Database['public']['Enums']['moderation_decision']
          note: string
          created_at?: string
        }
        Update: never
        Relationships: GenericRelationship[]
      }
      location_shares: {
        Row: {
          id: string
          sender_id: string
          recipient_contact_id: string | null
          lat: number | null
          lng: number | null
          accuracy_m: number | null
          mode: Database['public']['Enums']['location_share_mode']
          share_channel: Database['public']['Enums']['share_channel']
          shared_at: string
          created_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          recipient_contact_id?: string | null
          lat?: number | null
          lng?: number | null
          accuracy_m?: number | null
          mode?: Database['public']['Enums']['location_share_mode']
          share_channel?: Database['public']['Enums']['share_channel']
          shared_at?: string
          created_at?: string
        }
        Update: never
        Relationships: GenericRelationship[]
      }
      area_lookup: {
        Row: {
          id: string
          name: string
          name_bn: string
          division: string
          city: string
          thana: string
          neighborhood: string | null
          centroid: unknown
          bbox: unknown
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          name_bn: string
          division?: string
          city?: string
          thana: string
          neighborhood?: string | null
          centroid: unknown
          bbox?: unknown
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['area_lookup']['Insert']>
        Relationships: GenericRelationship[]
      }
      geocode_cache: {
        Row: {
          key: string
          area_hierarchy: Json
          source: Database['public']['Enums']['geocode_source']
          created_at: string
          last_hit_at: string | null
        }
        Insert: {
          key: string
          area_hierarchy: Json
          source: Database['public']['Enums']['geocode_source']
          created_at?: string
          last_hit_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['geocode_cache']['Insert']>
        Relationships: GenericRelationship[]
      }
      stations: {
        Row: {
          id: string
          station_type: Database['public']['Enums']['station_type']
          name: string
          name_bn: string | null
          phone: string
          lat: number
          lng: number
          address: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          station_type: Database['public']['Enums']['station_type']
          name: string
          name_bn?: string | null
          phone: string
          lat: number
          lng: number
          address?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['stations']['Insert']>
        Relationships: GenericRelationship[]
      }
      hotlines: {
        Row: {
          id: string
          name: string
          name_bn: string | null
          phone: string
          category: string
          description: string | null
          sort_order: number
          is_active: boolean
          last_verified_at: string
          created_at: string
        }
        Insert: {
          id: string
          name: string
          name_bn?: string | null
          phone: string
          category: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          last_verified_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hotlines']['Insert']>
        Relationships: GenericRelationship[]
      }
      wrong_number_reports: {
        Row: {
          id: string
          /** Nullable — FR-SEEK-6 lets any user report, signed in or not. */
          reporter_id: string | null
          entry_type: string
          entry_id: string
          reason: string
          /** The citizen's free text. Optional — `null` when they wrote none. */
          details: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          reporter_id?: string | null
          entry_type: string
          entry_id: string
          reason: string
          details?: string | null
          status?: string
          created_at?: string
        }
        Update: { status?: string; reporter_id?: string | null; details?: string | null }
        Relationships: GenericRelationship[]
      }
      job_runs: {
        Row: {
          id: string
          job_name: string
          status: string
          items_processed: number
          items_failed: number
          bytes_reclaimed: number
          error_detail: string | null
          started_at: string
          finished_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_name: string
          status?: string
          items_processed?: number
          items_failed?: number
          bytes_reclaimed?: number
          error_detail?: string | null
          started_at?: string
          finished_at?: string | null
          created_at?: string
        }
        Update: never
        Relationships: GenericRelationship[]
      }
    }
    Views: {
      /**
       * The public feed projection.
       *
       * `author_id` is **absent** — not nulled. A named null column would
       * still leak the field name and would fail the negative privacy test
       * (FR-DATA-3 / FR-NG-5).
       */
      alerts_feed: {
        Row: {
          id: string
          category: Database['public']['Enums']['report_category'] | null
          description: string | null
          area_hierarchy: Json
          captured_at: string
          public_visibility: Database['public']['Enums']['public_visibility']
          author_display_name: string | null
          has_media: boolean
          media_count: number
        }
        Relationships: GenericRelationship[]
      }
    }
    Functions: {
      finalize_capture: {
        Args: {
          p_client_request_id: string
          p_storage_path: string
          p_media_type: Database['public']['Enums']['media_type']
          p_byte_size: number
          p_duration_seconds: number | null
          p_width: number | null
          p_height: number | null
          p_lat: number
          p_lng: number
          p_captured_at: string
          p_description: string | null
          p_public_visibility: Database['public']['Enums']['public_visibility']
          p_category: Database['public']['Enums']['report_category'] | null
        }
        Returns: string
      }
      flag_report: {
        Args: { p_report_id: string; p_reason: Database['public']['Enums']['flag_reason'] }
        Returns: Json
      }
      update_category: {
        Args: {
          p_report_id: string
          p_category: Database['public']['Enums']['report_category']
        }
        Returns: Json
      }
      moderation_decide: {
        Args: { p_report_id: string; p_decision: string; p_note: string }
        Returns: Json
      }
      disable_user: {
        Args: { p_user_id: string; p_note: string }
        Returns: Json
      }
      reverse_geocode: {
        Args: { p_lat: number; p_lng: number }
        Returns: Json
      }
      nearest_thana: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number }
        Returns: {
          id: string | null
          name: string | null
          name_bn: string | null
          phone: string | null
          distance_km: number | null
          fallback: boolean
        }[]
      }
      geocode_key: {
        Args: { p_lat: number; p_lng: number }
        Returns: string
      }
      /**
       * Resolves which of the calling user's own contacts are Nagar Shield
       * users.
       *
       * Returns **contact ids only** — no phone, name, email, or user id.
       * `public.profiles` stays owner-scoped; nothing is loosened to make
       * this work.
       */
      resolve_app_contacts: {
        Args: { p_contact_ids: string[] }
        Returns: string[]
      }
      /**
       * The paginated public projection (FR-ALERTS-1..4).
       *
       * `author_id` is absent from the output — the column is omitted at the
       * projection level, not nulled (FR-DATA-3 / FR-NG-5).
       */
      alerts_feed: {
        Args: {
          p_division?: string | null
          p_city?: string | null
          p_thana?: string | null
          p_neighborhood?: string | null
          p_cursor?: string | null
          p_limit?: number
        }
        Returns: Json
      }
      history_nearby: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_km?: number
          p_window_hours?: number
          p_category?: Database['public']['Enums']['report_category'] | null
          p_cursor?: string | null
          p_limit?: number
        }
        Returns: Json
      }
      /**
       * The public alert detail for one visibly-moderated report.
       *
       * Carries no author id and no author display name unless the report was
       * filed as `identified` (FR-DATA-3 / FR-NG-5). Returns `null` for a
       * removed or deleted report.
       */
      alert_detail: {
        Args: { p_report_id: string }
        Returns: Json
      }
      moderation_queue: {
        Args: { p_cursor?: string | null; p_limit?: number }
        Returns: Json
      }
      resolve_login_identifier: {
        Args: { p_identifier: string }
        Returns: Json
      }
      record_biometric_attempt: {
        Args: { p_success: boolean }
        Returns: Json
      }
      soft_delete_account: {
        Args: Record<string, never>
        Returns: Json
      }
      restore_account: {
        Args: Record<string, never>
        Returns: Json
      }
      feed_cursor: {
        Args: { p_captured_at: string; p_id: string }
        Returns: string
      }
      parse_feed_cursor: {
        Args: { p_cursor: string }
        Returns: { captured_at: string; id: string }[]
      }
      jsonb_slice: {
        Args: { p_items: Json; p_count: number }
        Returns: Json
      }
    }
    Enums: {
      app_role: 'citizen' | 'moderator'
      contact_group: 'family' | 'friend' | 'colleague' | 'other'
      flag_reason: 'misinformation' | 'harassment' | 'duplicate' | 'off_topic' | 'other'
      geocode_source: 'local' | 'online' | 'degraded'
      hide_reason: 'flag_threshold' | 'author_auto_hide' | 'both' | 'manual'
      location_share_mode: 'snapshot'
      media_type: 'photo' | 'video' | 'file'
      moderation_decision: 'restore' | 'remove' | 'disable_user'
      moderation_status: 'visible' | 'hidden_pending_review' | 'restored' | 'removed'
      public_visibility: 'anonymous' | 'identified'
      report_category:
        | 'theft'
        | 'assault'
        | 'harassment'
        | 'robbery'
        | 'accident'
        | 'fire'
        | 'medical'
        | 'fraud'
        | 'vandalism'
        | 'suspicious'
        | 'other'
      share_channel: 'app' | 'os_share_sheet'
      station_type: 'police' | 'hospital' | 'fire'
      locale: 'bn' | 'en'
      theme: 'light' | 'dark'
    }
    CompositeTypes: Record<string, never>
  }
}
