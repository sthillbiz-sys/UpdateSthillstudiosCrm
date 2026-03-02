export interface Contact {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  company_id?: number | null;
  email?: string | null;
  phone?: string | null;
  assigned_to?: string | null;
  status?: string | null;
  position?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  team_count?: number;
}

export interface Company {
  id: number;
  name: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  contact_count?: number;
}

export interface Deal {
  id: number;
  title: string;
  value: number;
  stage: string;
  probability: number;
  expected_close_date?: string | null;
  contact_id?: number | null;
  company_id?: number | null;
  notes?: string | null;
  contact_name?: string | null;
  company_name?: string | null;
}

export interface Call {
  id: number;
  contact_name: string;
  phone_number: string;
  duration: number;
  status: string;
  timestamp: string;
  twilio_call_sid?: string | null;
  twilio_parent_call_sid?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  created_by_user_id?: number | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  source: string;
  timestamp: string;
}

export interface Employee {
  id: number;
  name: string;
  email?: string;
  role?: string;
  contact_info?: string;
  hourly_rate?: number | null;
  hire_date?: string | null;
  status?: string | null;
}

export interface CalendarNote {
  id: number;
  note_date: string;
  note_text: string;
  contact_id?: number | null;
  contact_name?: string | null;
  follow_up_type: string;
  priority: string;
  completed: number | boolean;
  created_at?: string;
  created_by_user_id?: number | null;
}

export interface Meeting {
  id: number;
  title: string;
  meeting_type: string;
  scheduled_date: string;
  scheduled_time: string;
  duration: string;
  description?: string | null;
  room_name: string;
  status: string;
  attendees_json?: string | null;
}

export interface ShiftEntry {
  id: number;
  user_id: number;
  shift_date: string;
  clock_in: string;
  clock_out?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  lunch_duration_minutes: number;
  total_hours?: number | null;
  status: 'clocked_in' | 'on_lunch' | 'clocked_out';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}
