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
      booking_extensions: {
        Row: {
          id: string
          booking_id: string
          customer_id: string
          vendor_id: string
          hours: number
          note: string | null
          new_end_date: string
          new_dropoff_time: string
          extra_base: number
          service_fee: number
          gst_amount: number
          commission_amount: number
          commission_gst: number
          provider_earning: number
          extra_total: number
          status: string
          decided_at: string | null
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          customer_id: string
          vendor_id: string
          hours: number
          note?: string | null
          new_end_date: string
          new_dropoff_time: string
          extra_base: number
          service_fee: number
          gst_amount: number
          commission_amount: number
          commission_gst: number
          provider_earning: number
          extra_total: number
          status?: string
          decided_at?: string | null
          paid_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          customer_id?: string
          vendor_id?: string
          hours?: number
          note?: string | null
          new_end_date?: string
          new_dropoff_time?: string
          extra_base?: number
          service_fee?: number
          gst_amount?: number
          commission_amount?: number
          commission_gst?: number
          provider_earning?: number
          extra_total?: number
          status?: string
          decided_at?: string | null
          paid_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_extensions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
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
          commission_amount: number
          commission_gst: number
          earning_credited_at: string | null
          gst_amount: number
          provider_earning: number
          service_fee: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          refund_amount: number
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
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          refund_amount?: number
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
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          refund_amount?: number
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
      cleaners: {
        Row: {
          available: boolean
          avg_rating: number
          bio: string | null
          city: string
          created_at: string
          experience_years: number
          full_name: string
          id: string
          phone: string | null
          rejection_reason: string | null
          review_count: number
          service_area: string | null
          services: string[]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          available?: boolean
          avg_rating?: number
          bio?: string | null
          city?: string
          created_at?: string
          experience_years?: number
          full_name: string
          id: string
          phone?: string | null
          rejection_reason?: string | null
          review_count?: number
          service_area?: string | null
          services?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          available?: boolean
          avg_rating?: number
          bio?: string | null
          city?: string
          created_at?: string
          experience_years?: number
          full_name?: string
          id?: string
          phone?: string | null
          rejection_reason?: string | null
          review_count?: number
          service_area?: string | null
          services?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
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
          commission_amount: number
          commission_gst: number
          earning_credited_at: string | null
          gst_amount: number
          provider_earning: number
          service_fee: number
          base_price: number
          coupon_code: string | null
          discount: number
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
          trip_type: string | null
          updated_at: string
        }
        Insert: {
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          base_price?: number
          coupon_code?: string | null
          discount?: number
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
          trip_type?: string | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          base_price?: number
          coupon_code?: string | null
          discount?: number
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
          trip_type?: string | null
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
      platform_settings: {
        Row: {
          commission_pct: number
          gst_pct: number
          id: number
          min_withdrawal: number
          service_fee_pct: number
          updated_at: string
        }
        Insert: {
          commission_pct?: number
          gst_pct?: number
          id?: number
          min_withdrawal?: number
          service_fee_pct?: number
          updated_at?: string
        }
        Update: {
          commission_pct?: number
          gst_pct?: number
          id?: number
          min_withdrawal?: number
          service_fee_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      pool_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          rating: number
          request_id: string | null
          role: string
          trip_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          rating: number
          request_id?: string | null
          role: string
          trip_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          rating?: number
          request_id?: string | null
          role?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "pool_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pool_requests"
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
          emergency_contact: string | null
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
          emergency_contact?: string | null
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
          emergency_contact?: string | null
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
          referral_code: string | null
          referral_rewarded: boolean | null
          referred_by: string | null
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
          referral_code?: string | null
          referral_rewarded?: boolean | null
          referred_by?: string | null
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
          referral_code?: string | null
          referral_rewarded?: boolean | null
          referred_by?: string | null
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
      user_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
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
          commission_amount: number
          commission_gst: number
          earning_credited_at: string | null
          gst_amount: number
          provider_earning: number
          service_fee: number
          base_price: number
          coupon_code: string | null
          discount: number
          address: string
          admin_note: string | null
          after_photos: string[]
          assigned_cleaner_id: string | null
          assigned_vendor_id: string | null
          before_photos: string[]
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
          progress: Database["public"]["Enums"]["wash_status"]
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          refund_amount: number
          rejection_reason: string | null
          service_id: string
          slot_date: string
          slot_time: string
          status: string
          updated_at: string
          vehicle_id: string | null
          vehicle_label: string | null
        }
        Insert: {
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          base_price?: number
          coupon_code?: string | null
          discount?: number
          address: string
          admin_note?: string | null
          after_photos?: string[]
          assigned_cleaner_id?: string | null
          assigned_vendor_id?: string | null
          before_photos?: string[]
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
          progress?: Database["public"]["Enums"]["wash_status"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          service_id: string
          slot_date: string
          slot_time: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Update: {
          commission_amount?: number
          commission_gst?: number
          earning_credited_at?: string | null
          gst_amount?: number
          provider_earning?: number
          service_fee?: number
          base_price?: number
          coupon_code?: string | null
          discount?: number
          address?: string
          admin_note?: string | null
          after_photos?: string[]
          assigned_cleaner_id?: string | null
          assigned_vendor_id?: string | null
          before_photos?: string[]
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
          progress?: Database["public"]["Enums"]["wash_status"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          service_id?: string
          slot_date?: string
          slot_time?: string
          status?: string
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
      wash_centers: {
        Row: {
          active: boolean
          address: string | null
          avg_rating: number
          city: string
          closing_time: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          daily_capacity: number
          id: string
          name: string
          opening_time: string
          rejection_reason: string | null
          review_count: number
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          active?: boolean
          address?: string | null
          avg_rating?: number
          city?: string
          closing_time?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_capacity?: number
          id: string
          name: string
          opening_time?: string
          rejection_reason?: string | null
          review_count?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          active?: boolean
          address?: string | null
          avg_rating?: number
          city?: string
          closing_time?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_capacity?: number
          id?: string
          name?: string
          opening_time?: string
          rejection_reason?: string | null
          review_count?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      wash_center_packages: {
        Row: {
          category: string
          center_id: string
          created_at: string
          duration: number
          id: string
          name: string
          price: number
        }
        Insert: {
          category?: string
          center_id: string
          created_at?: string
          duration?: number
          id?: string
          name: string
          price: number
        }
        Update: {
          category?: string
          center_id?: string
          created_at?: string
          duration?: number
          id?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "wash_center_packages_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "wash_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_center_staff: {
        Row: {
          active: boolean
          center_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          role: string
        }
        Insert: {
          active?: boolean
          center_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          role?: string
        }
        Update: {
          active?: boolean
          center_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_center_staff_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "wash_centers"
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
      wash_reviews: {
        Row: {
          center_id: string | null
          cleaner_id: string | null
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          rating: number
          response: string | null
          response_at: string | null
          updated_at: string
          vendor_id: string | null
          wash_booking_id: string
        }
        Insert: {
          center_id?: string | null
          cleaner_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating: number
          response?: string | null
          response_at?: string | null
          updated_at?: string
          vendor_id?: string | null
          wash_booking_id: string
        }
        Update: {
          center_id?: string | null
          cleaner_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          response?: string | null
          response_at?: string | null
          updated_at?: string
          vendor_id?: string | null
          wash_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_reviews_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "wash_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_reviews_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "wash_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wash_reviews_wash_booking_id_fkey"
            columns: ["wash_booking_id"]
            isOneToOne: true
            referencedRelation: "wash_bookings"
            referencedColumns: ["id"]
          },
        ]
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
      withdrawals: {
        Row: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          ifsc: string | null
          method: string
          processed_at: string | null
          processed_by: string | null
          reference: string | null
          status: string
          upi_id: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount: number
          created_at?: string
          id?: string
          ifsc?: string | null
          method: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          status?: string
          upi_id?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          ifsc?: string | null
          method?: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          status?: string
          upi_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
      category_rules: {
        Row: {
          advance_notice_hours: number
          category: string
          created_at: string
          id: string
          min_deposit: number
          min_window_hours: number
          updated_at: string
        }
        Insert: {
          advance_notice_hours?: number
          category: string
          created_at?: string
          id?: string
          min_deposit?: number
          min_window_hours?: number
          updated_at?: string
        }
        Update: {
          advance_notice_hours?: number
          category?: string
          created_at?: string
          id?: string
          min_deposit?: number
          min_window_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          state: string
          surge_multiplier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          state?: string
          surge_multiplier?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          state?: string
          surge_multiplier?: number
          updated_at?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          admin_notes: string | null
          booking_id: string | null
          created_at: string
          description: string | null
          id: string
          item_name: string | null
          lat: number | null
          lng: number | null
          location_text: string | null
          reporter_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_name?: string | null
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          reporter_id: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_name?: string | null
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          reporter_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          }
        ]
      }
      platform_settings: {
        Row: {
          commission_driver_pct: number
          commission_pct: number
          commission_pool_pct: number
          commission_rental_pct: number
          commission_wash_pct: number
          gst_pct: number
          id: number
          instant_confirm_default: boolean
          maintenance_mode: boolean
          max_wallet_topup: number
          min_driver_advance_hours: number
          min_withdrawal: number
          service_fee_pct: number
          sos_phone: string
          updated_at: string
        }
        Insert: {
          commission_driver_pct?: number
          commission_pct?: number
          commission_pool_pct?: number
          commission_rental_pct?: number
          commission_wash_pct?: number
          gst_pct?: number
          id?: number
          instant_confirm_default?: boolean
          maintenance_mode?: boolean
          max_wallet_topup?: number
          min_driver_advance_hours?: number
          min_withdrawal?: number
          service_fee_pct?: number
          sos_phone?: string
          updated_at?: string
        }
        Update: {
          commission_driver_pct?: number
          commission_pct?: number
          commission_pool_pct?: number
          commission_rental_pct?: number
          commission_wash_pct?: number
          gst_pct?: number
          id?: number
          instant_confirm_default?: boolean
          maintenance_mode?: boolean
          max_wallet_topup?: number
          min_driver_advance_hours?: number
          min_withdrawal?: number
          service_fee_pct?: number
          sos_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          resolution: string | null
          status: string
          subject: string
          ticket_no: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolution?: string | null
          status?: string
          subject: string
          ticket_no: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolution?: string | null
          status?: string
          subject?: string
          ticket_no?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          }
        ]
      }
      trusted_contacts: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_maintenance: {
        Row: {
          cost: number
          created_at: string
          date: string
          id: string
          notes: string | null
          odometer: number | null
          service_type: string
          vehicle_id: string
          vendor_id: string
          workshop: string | null
        }
        Insert: {
          cost?: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          odometer?: number | null
          service_type: string
          vehicle_id: string
          vendor_id: string
          workshop?: string | null
        }
        Update: {
          cost?: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          odometer?: number | null
          service_type?: string
          vehicle_id?: string
          vendor_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          }
        ]
      }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_remove_review: {
        Args: {
          _review_id: string
        }
        Returns: undefined
      }
      admin_dismiss_review_report: {
        Args: {
          _review_id: string
        }
        Returns: undefined
      }
      admin_revenue_aggregates: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      generate_scheduled_reminders: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_decide_withdrawal: {
        Args: { _decision: string; _note?: string; _reference?: string; _withdrawal_id: string }
        Returns: undefined
      }
      admin_grant_credit: {
        Args: { _amount: number; _email: string; _note?: string }
        Returns: number
      }
      admin_refund: {
        Args: { _amount: number; _email: string; _reason: string }
        Returns: number
      }
      advance_wash_status: {
        Args: {
          _next_status: string
          _notes?: string | null
          _photos?: string[] | null
          _wash_booking_id: string
        }
        Returns: Json
      }
      cancel_booking: {
        Args: { _booking_id: string; _reason?: string }
        Returns: Json
      }
      cancel_booking_extension: { Args: { _extension_id: string }; Returns: undefined }
      compute_charges: {
        Args: { _base: number; _coupon?: string }
        Returns: Json
      }
      decide_booking_extension: {
        Args: { _accept: boolean; _extension_id: string }
        Returns: string
      }
      request_booking_extension: {
        Args: { _booking_id: string; _hours: number; _note?: string }
        Returns: string
      }
      request_withdrawal: {
        Args: {
          _account_name?: string
          _account_number?: string
          _amount: number
          _ifsc?: string
          _method: string
          _upi_id?: string
        }
        Returns: string
      }
      wallet_pay_extension: { Args: { _extension_id: string }; Returns: number }
      withdrawable_balance: { Args: { _user?: string }; Returns: number }
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
      claim_wash_job: {
        Args: {
          _wash_booking_id?: string
          id?: string
        }
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
      verify_cleaner: {
        Args: {
          _cleaner_id: string
          _decision: string
          _rejection_reason?: string | null
        }
        Returns: undefined
      }
      verify_wash_center: {
        Args: {
          _center_id: string
          _decision: string
          _rejection_reason?: string | null
        }
        Returns: undefined
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
      app_role: "customer" | "vendor" | "admin" | "cleaner" | "wash_center"
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
      wash_status:
        | "requested"
        | "confirmed"
        | "assigned"
        | "on_the_way"
        | "started"
        | "completed"
        | "cancelled"
        | "rejected"
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
      app_role: ["customer", "vendor", "admin", "cleaner", "wash_center"],
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
