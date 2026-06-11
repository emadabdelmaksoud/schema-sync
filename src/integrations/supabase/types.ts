export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string
          quantity_base_unit: number
          section_id: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id: string
          quantity_base_unit?: number
          section_id?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string
          quantity_base_unit?: number
          section_id?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          notes: string | null
          performed_by: string | null
          product_id: string
          quantity: number
          quantity_base_unit: number
          section_id: string | null
          transaction_type: Database["public"]["Enums"]["inventory_txn_type"]
          unit_id: string
          warehouse_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id: string
          quantity: number
          quantity_base_unit: number
          section_id?: string | null
          transaction_type: Database["public"]["Enums"]["inventory_txn_type"]
          unit_id: string
          warehouse_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id?: string
          quantity?: number
          quantity_base_unit?: number
          section_id?: string | null
          transaction_type?: Database["public"]["Enums"]["inventory_txn_type"]
          unit_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          created_at: string
          current_quantity: number
          department: Database["public"]["Enums"]["department"]
          expiry_date: string | null
          id: string
          name: string
          store_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          current_quantity?: number
          department: Database["public"]["Enums"]["department"]
          expiry_date?: string | null
          id?: string
          name: string
          store_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          current_quantity?: number
          department?: Database["public"]["Enums"]["department"]
          expiry_date?: string | null
          id?: string
          name?: string
          store_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          metadata: Json | null
          read_at: string | null
          severity: string
          title: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_units: {
        Row: {
          barcode: string | null
          created_at: string
          factor_to_base: number
          id: string
          is_base: boolean
          product_id: string
          sort_order: number
          unit_name: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          factor_to_base: number
          id?: string
          is_base?: boolean
          product_id: string
          sort_order?: number
          unit_name: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          factor_to_base?: number
          id?: string
          is_base?: boolean
          product_id?: string
          sort_order?: number
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_unit: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          manufacturer: string | null
          notes: string | null
          product_code: string
          product_name: string
          reorder_level: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          base_unit?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          notes?: string | null
          product_code: string
          product_name: string
          reorder_level?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          base_unit?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          notes?: string | null
          product_code?: string
          product_name?: string
          reorder_level?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_staff: {
        Row: {
          store_id: string
          user_id: string
        }
        Insert: {
          store_id: string
          user_id: string
        }
        Update: {
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_staff_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_parent_store_id_fkey"
            columns: ["parent_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["department"]
          id: string
          item_id: string
          quantity: number
          serial_no: number
          staff_name_snapshot: string | null
          staff_user_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
          store_id: string
          store_name_snapshot: string | null
          transfer_to_store_id: string | null
        }
        Insert: {
          created_at?: string
          department: Database["public"]["Enums"]["department"]
          id?: string
          item_id: string
          quantity: number
          serial_no?: number
          staff_name_snapshot?: string | null
          staff_user_id?: string | null
          status: Database["public"]["Enums"]["tx_status"]
          store_id: string
          store_name_snapshot?: string | null
          transfer_to_store_id?: string | null
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["department"]
          id?: string
          item_id?: string
          quantity?: number
          serial_no?: number
          staff_name_snapshot?: string | null
          staff_user_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          store_id?: string
          store_name_snapshot?: string | null
          transfer_to_store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_store_id_fkey"
            columns: ["transfer_to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          decided_at: string | null
          from_store_id: string
          id: string
          item_id: string
          quantity: number
          requested_by: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_store_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          from_store_id: string
          id?: string
          item_id: string
          quantity: number
          requested_by: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_store_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          from_store_id?: string
          id?: string
          item_id?: string
          quantity?: number
          requested_by?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_requests_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_sections: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          section_name: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          section_name: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          section_name?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sections_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          updated_at: string
          warehouse_code: string
          warehouse_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          warehouse_code: string
          warehouse_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          warehouse_code?: string
          warehouse_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      stock_on_hand: {
        Row: {
          product_id: string | null
          quantity_base_unit: number | null
          section_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      convert_units: {
        Args: { _from_unit: string; _qty: number; _to_unit: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_in_store: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "nurse" | "staff"
      department: "pharmacy" | "supplies"
      inventory_txn_type:
        | "stock_in"
        | "dispensing"
        | "transfer_in"
        | "transfer_out"
        | "disposal"
        | "adjustment"
        | "inventory_count"
      transfer_status: "pending" | "approved" | "rejected"
      tx_status: "added" | "dispensing" | "transferred" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "nurse", "staff"],
      department: ["pharmacy", "supplies"],
      inventory_txn_type: [
        "stock_in",
        "dispensing",
        "transfer_in",
        "transfer_out",
        "disposal",
        "adjustment",
        "inventory_count",
      ],
      transfer_status: ["pending", "approved", "rejected"],
      tx_status: ["added", "dispensing", "transferred", "expired"],
    },
  },
} as const
