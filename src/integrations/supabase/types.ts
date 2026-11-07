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
      availability_blocks: {
        Row: {
          created_at: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_locations: {
        Row: {
          accuracy: number | null
          booking_id: string
          created_at: string
          heading: number | null
          id: string
          lat: number
          lng: number
          speed: number | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          booking_id: string
          created_at?: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          speed?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          booking_id?: string
          created_at?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          speed?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_locations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          base_price: number
          coupon_code: string | null
          created_at: string
          customer_id: string
          discount: number
          dropoff_time: string
          end_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          pickup_checked_at: string | null
          pickup_damage: Json | null
          pickup_fuel_pct: number | null
          pickup_notes: string | null
          pickup_odometer: number | null
          pickup_photos: string[]
          pickup_time: string
          qr_code: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          return_checked_at: string | null
          return_damage: Json | null
          return_fuel_pct: number | null
          return_notes: string | null
          return_odometer: number | null
          return_photos: string[]
          security_deposit: number
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at: string
          vehicle_id: string
          vendor_id: string
        }
        Insert: {
          base_price: number
          coupon_code?: string | null
          created_at?: string
          customer_id: string
          discount?: number
          dropoff_time?: string
          end_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pickup_checked_at?: string | null
          pickup_damage?: Json | null
          pickup_fuel_pct?: number | null
          pickup_notes?: string | null
          pickup_odometer?: number | null
          pickup_photos?: string[]
          pickup_time?: string
          qr_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          return_checked_at?: string | null
          return_damage?: Json | null
          return_fuel_pct?: number | null
          return_notes?: string | null
          return_odometer?: number | null
          return_photos?: string[]
          security_deposit?: number
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at?: string
          vehicle_id: string
          vendor_id: string
        }
        Update: {
          base_price?: number
          coupon_code?: string | null
          created_at?: string
          customer_id?: string
          discount?: number
          dropoff_time?: string
          end_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pickup_checked_at?: string | null
          pickup_damage?: Json | null
          pickup_fuel_pct?: number | null
          pickup_notes?: string | null
          pickup_odometer?: number | null
          pickup_photos?: string[]
          pickup_time?: string
          qr_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          return_checked_at?: string | null
          return_damage?: Json | null
          return_fuel_pct?: number | null
          return_notes?: string | null
          return_odometer?: number | null
          return_photos?: string[]
          security_deposit?: number
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
          updated_at?: string
          vehicle_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          amount_off: number | null
          code: string
          created_at: string
          ends_at: string | null
          id: string
          percent_off: number | null
          starts_at: string | null
        }
        Insert: {
          active?: boolean
          amount_off?: number | null
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          percent_off?: number | null
          starts_at?: string | null
        }
        Update: {
          active?: boolean
          amount_off?: number | null
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          percent_off?: number | null
          starts_at?: string | null
        }
        Relationships: []
      }
      disputes: {
        Row: {
          booking_id: string
          category: string
          created_at: string
          detail: string | null
          id: string
          photos: string[]
          raised_by: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          photos?: string[]
          raised_by: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          photos?: string[]
          raised_by?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_bookings: {
        Row: {
          booking_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          customer_id: string
          days: number
          driver_id: string
          end_date: string
          end_time: string
          hours: number
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          pickup_address: string | null
          rate_type: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          refund_amount: number
          start_date: string
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id: string
          days?: number
          driver_id: string
          end_date: string
          end_time?: string
          hours?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pickup_address?: string | null
          rate_type?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          start_date: string
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string
          days?: number
          driver_id?: string
          end_date?: string
          end_time?: string
          hours?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pickup_address?: string | null
          rate_type?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          start_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          driver_booking_id: string
          driver_id: string
          driver_response: string | null
          driver_response_at: string | null
          id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          driver_booking_id: string
          driver_id: string
          driver_response?: string | null
          driver_response_at?: string | null
          id?: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          driver_booking_id?: string
          driver_id?: string
          driver_response?: string | null
          driver_response_at?: string | null
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_reviews_driver_booking_id_fkey"
            columns: ["driver_booking_id"]
            isOneToOne: true
            referencedRelation: "driver_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          avg_rating: number
          bio: string | null
          city: string
          created_at: string
          daily_rate: number
          dl_back_url: string | null
          dl_expiry: string | null
          dl_front_url: string | null
          dl_number: string | null
          experience_years: number
          full_name: string
          hourly_rate: number
          id: string
          id_document_url: string | null
          languages: string[]
          phone: string | null
          photo_url: string | null
          rejection_reason: string | null
          review_count: number
          service_area: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          trip_types: string[]
          updated_at: string
          vehicle_types: string[]
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
        }
        Insert: {
          avg_rating?: number
          bio?: string | null
          city: string
          created_at?: string
          daily_rate: number
          dl_back_url?: string | null
          dl_expiry?: string | null
          dl_front_url?: string | null
          dl_number?: string | null
          experience_years?: number
          full_name: string
          hourly_rate?: number
          id: string
          id_document_url?: string | null
          languages?: string[]
          phone?: string | null
          photo_url?: string | null
          rejection_reason?: string | null
          review_count?: number
          service_area?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          trip_types?: string[]
          updated_at?: string
          vehicle_types?: string[]
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Update: {
          avg_rating?: number
          bio?: string | null
          city?: string
          created_at?: string
          daily_rate?: number
          dl_back_url?: string | null
          dl_expiry?: string | null
          dl_front_url?: string | null
          dl_number?: string | null
          experience_years?: number
          full_name?: string
          hourly_rate?: number
          id?: string
          id_document_url?: string | null
          languages?: string[]
          phone?: string | null
          photo_url?: string | null
          rejection_reason?: string | null
          review_count?: number
          service_area?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          trip_types?: string[]
          updated_at?: string
          vehicle_types?: string[]
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          booking_id: string
          created_at: string
          id: string
          image_url: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          booking_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          id: string
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          id?: string
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_requests: {
        Row: {
          cancellation_reason: string | null
          cancelled_by: string | null
          created_at: string
          drop_label: string
          drop_lat: number
          drop_lng: number
          fare_total: number
          id: string
          match_score: number
          note: string | null
          passenger_id: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          seats: number
          status: Database["public"]["Enums"]["booking_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          drop_label: string
          drop_lat: number
          drop_lng: number
          fare_total?: number
          id?: string
          match_score?: number
          note?: string | null
          passenger_id: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          seats?: number
          status?: Database["public"]["Enums"]["booking_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          drop_label?: string
          drop_lat?: number
          drop_lng?: number
          fare_total?: number
          id?: string
          match_score?: number
          note?: string | null
          passenger_id?: string
          pickup_label?: string
          pickup_lat?: number
          pickup_lng?: number
          seats?: number
          status?: Database["public"]["Enums"]["booking_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_requests_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "pool_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_trips: {
        Row: {
          created_at: string
          depart_at: string
          dest_label: string
          dest_lat: number
          dest_lng: number
          driver_id: string
          fare_per_seat: number
          id: string
          notes: string | null
          origin_label: string
          origin_lat: number
          origin_lng: number
          route: Json
          seats_available: number
          seats_total: number
          status: string
          updated_at: string
          vehicle_label: string
        }
        Insert: {
          created_at?: string
          depart_at: string
          dest_label: string
          dest_lat: number
          dest_lng: number
          driver_id: string
          fare_per_seat: number
          id?: string
          notes?: string | null
          origin_label: string
          origin_lat: number
          origin_lng: number
          route?: Json
          seats_available: number
          seats_total: number
          status?: string
          updated_at?: string
          vehicle_label: string
        }
        Update: {
          created_at?: string
          depart_at?: string
          dest_label?: string
          dest_lat?: number
          dest_lng?: number
          driver_id?: string
          fare_per_seat?: number
          id?: string
          notes?: string | null
          origin_label?: string
          origin_lat?: number
          origin_lng?: number
          route?: Json
          seats_available?: number
          seats_total?: number
          status?: string
          updated_at?: string
          vehicle_label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          dl_back_url: string | null
          dl_expiry: string | null
          dl_front_url: string | null
          dl_number: string | null
          dl_rejection_reason: string | null
          dl_status: Database["public"]["Enums"]["dl_status"]
          dl_verified_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          dl_back_url?: string | null
          dl_expiry?: string | null
          dl_front_url?: string | null
          dl_number?: string | null
          dl_rejection_reason?: string | null
          dl_status?: Database["public"]["Enums"]["dl_status"]
          dl_verified_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          dl_back_url?: string | null
          dl_expiry?: string | null
          dl_front_url?: string | null
          dl_number?: string | null
          dl_rejection_reason?: string | null
          dl_status?: Database["public"]["Enums"]["dl_status"]
          dl_verified_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_drivers: {
        Row: {
          avg_rating: number
          bio: string | null
          city: string
          created_at: string
          daily_rate: number
          experience_years: number
          full_name: string
          hourly_rate: number
          id: string
          languages: string[]
          photo_url: string | null
          review_count: number
          service_area: string | null
          trip_types: string[]
          updated_at: string
          vehicle_types: string[]
        }
        Insert: {
          avg_rating?: number
          bio?: string | null
          city: string
          created_at?: string
          daily_rate: number
          experience_years?: number
          full_name: string
          hourly_rate?: number
          id: string
          languages?: string[]
          photo_url?: string | null
          review_count?: number
          service_area?: string | null
          trip_types?: string[]
          updated_at?: string
          vehicle_types?: string[]
        }
        Update: {
          avg_rating?: number
          bio?: string | null
          city?: string
          created_at?: string
          daily_rate?: number
          experience_years?: number
          full_name?: string
          hourly_rate?: number
          id?: string
          languages?: string[]
          photo_url?: string | null
          review_count?: number
          service_area?: string | null
          trip_types?: string[]
          updated_at?: string
          vehicle_types?: string[]
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_vendors: {
        Row: {
          bio: string | null
          business_name: string
          created_at: string
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
        }
        Insert: {
          bio?: string | null
          business_name: string
          created_at?: string
          id: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
        }
        Update: {
          bio?: string | null
          business_name?: string
          created_at?: string
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_vendors_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          rating: number
          report_reason: string | null
          reported: boolean
          vehicle_id: string
          vendor_response: string | null
          vendor_response_at: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          rating: number
          report_reason?: string | null
          reported?: boolean
          vehicle_id: string
          vendor_response?: string | null
          vendor_response_at?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          report_reason?: string | null
          reported?: boolean
          vehicle_id?: string
          vendor_response?: string | null
          vendor_response_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
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
      vehicle_images: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          address: string | null
          avg_rating: number
          brand: string
          category: Database["public"]["Enums"]["vehicle_category"]
          city: string
          created_at: string
          description: string | null
          fitness_url: string | null
          fuel: Database["public"]["Enums"]["fuel_type"]
          id: string
          insurance_url: string | null
          lat: number | null
          lng: number | null
          mileage_kmpl: number | null
          model: string
          pollution_url: string | null
          price_daily: number
          price_hourly: number | null
          price_weekly: number | null
          rc_url: string | null
          rejection_reason: string | null
          review_count: number
          seats: number | null
          security_deposit: number
          status: Database["public"]["Enums"]["vehicle_status"]
          title: string
          transmission: Database["public"]["Enums"]["transmission_type"]
          updated_at: string
          vendor_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          year: number
        }
        Insert: {
          address?: string | null
          avg_rating?: number
          brand: string
          category: Database["public"]["Enums"]["vehicle_category"]
          city: string
          created_at?: string
          description?: string | null
          fitness_url?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          insurance_url?: string | null
          lat?: number | null
          lng?: number | null
          mileage_kmpl?: number | null
          model: string
          pollution_url?: string | null
          price_daily: number
          price_hourly?: number | null
          price_weekly?: number | null
          rc_url?: string | null
          rejection_reason?: string | null
          review_count?: number
          seats?: number | null
          security_deposit?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          title: string
          transmission?: Database["public"]["Enums"]["transmission_type"]
          updated_at?: string
          vendor_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          year: number
        }
        Update: {
          address?: string | null
          avg_rating?: number
          brand?: string
          category?: Database["public"]["Enums"]["vehicle_category"]
          city?: string
          created_at?: string
          description?: string | null
          fitness_url?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          insurance_url?: string | null
          lat?: number | null
          lng?: number | null
          mileage_kmpl?: number | null
          model?: string
          pollution_url?: string | null
          price_daily?: number
          price_hourly?: number | null
          price_weekly?: number | null
          rc_url?: string | null
          rejection_reason?: string | null
          review_count?: number
          seats?: number | null
          security_deposit?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          title?: string
          transmission?: Database["public"]["Enums"]["transmission_type"]
          updated_at?: string
          vendor_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          bio: string | null
          business_name: string
          created_at: string
          id: string
          id_document_url: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          payout_email: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          business_name: string
          created_at?: string
          id: string
          id_document_url?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          payout_email?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          business_name?: string
          created_at?: string
          id?: string
          id_document_url?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          payout_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wallet_topups: {
        Row: {
          amount: number
          created_at: string
          id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          booking_id: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          reference: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          reference?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wash_bookings: {
        Row: {
          address: string
          admin_note: string | null
          assigned_vendor_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          city: string
          completed_at: string | null
          created_at: string
          customer_id: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          price: number
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          refund_amount: number
          rejection_reason: string | null
          service_id: string
          slot_date: string
          slot_time: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          vehicle_id: string | null
          vehicle_label: string | null
        }
        Insert: {
          address: string
          admin_note?: string | null
          assigned_vendor_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          price: number
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          service_id: string
          slot_date: string
          slot_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Update: {
          address?: string
          admin_note?: string | null
          assigned_vendor_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          price?: number
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          service_id?: string
          slot_date?: string
          slot_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wash_bookings_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "wash_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "wash_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          sort_order: number
          updated_at: string
          vehicle_category: Database["public"]["Enums"]["vehicle_category"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price: number
          sort_order?: number
          updated_at?: string
          vehicle_category?: Database["public"]["Enums"]["vehicle_category"]
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
          vehicle_category?: Database["public"]["Enums"]["vehicle_category"]
        }
        Relationships: []
      }
      wash_vendors: {
        Row: {
          active: boolean
          city: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          daily_capacity: number
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_capacity?: number
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_capacity?: number
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_decide_wash_booking: {
        Args: {
          _decision: string
          _note?: string
          _vendor_id?: string
          _wash_booking_id: string
        }
        Returns: undefined
      }
      booked_vehicle_ids: {
        Args: { _end: string; _start: string }
        Returns: string[]
      }
      can_access_booking_folder: { Args: { _folder: string }; Returns: boolean }
      can_read_vehicle_image: { Args: { _name: string }; Returns: boolean }
      cancel_driver_booking: {
        Args: { _driver_booking_id: string; _reason?: string }
        Returns: Json
      }
      cancel_wash_booking: {
        Args: { _reason?: string; _wash_booking_id: string }
        Returns: Json
      }
      delete_my_account_data: { Args: never; Returns: Json }
      has_pool_request_on_trip: { Args: { _trip_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_end_user_request: { Args: never; Returns: boolean }
      is_pool_trip_driver: { Args: { _trip_id: string }; Returns: boolean }
      notify_admins: {
        Args: { _body: string; _link?: string; _title: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _body: string
          _link?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      report_review: {
        Args: { _reason: string; _review_id: string }
        Returns: undefined
      }
      validate_coupon: { Args: { _code: string }; Returns: Json }
      wallet_apply: {
        Args: {
          _amount: number
          _booking_id?: string
          _description?: string
          _kind: string
          _reference?: string
          _user_id: string
        }
        Returns: number
      }
      wallet_pay_booking: { Args: { _booking_id: string }; Returns: number }
      wallet_pay_driver_booking: {
        Args: { _driver_booking_id: string }
        Returns: number
      }
      wallet_pay_wash_booking: {
        Args: { _wash_booking_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "customer" | "vendor" | "admin"
      booking_status:
        | "pending"
        | "confirmed"
        | "rejected"
        | "cancelled"
        | "completed"
      dl_status: "none" | "pending" | "approved" | "rejected"
      fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | "none"
      kyc_status: "unsubmitted" | "pending" | "approved" | "rejected"
      transmission_type: "manual" | "automatic" | "none"
      vehicle_category: "scooter" | "bike" | "motorcycle" | "car" | "ev"
      vehicle_status: "draft" | "active" | "paused"
      verification_status: "pending" | "approved" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "vendor", "admin"],
      booking_status: [
        "pending",
        "confirmed",
        "rejected",
        "cancelled",
        "completed",
      ],
      dl_status: ["none", "pending", "approved", "rejected"],
      fuel_type: ["petrol", "diesel", "electric", "hybrid", "none"],
      kyc_status: ["unsubmitted", "pending", "approved", "rejected"],
      transmission_type: ["manual", "automatic", "none"],
      vehicle_category: ["scooter", "bike", "motorcycle", "car", "ev"],
      vehicle_status: ["draft", "active", "paused"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
