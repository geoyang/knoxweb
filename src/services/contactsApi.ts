import { supabase } from '../lib/supabase';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export interface LinkedProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface PhoneNumber {
  type: string;
  number: string;
}

export interface EmailAddress {
  type: string;
  email: string;
}

export interface MessagingApp {
  platform: string;
  handle: string;
}

export interface Contact {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone_numbers: PhoneNumber[];
  email_addresses: EmailAddress[];
  instagram_handle: string | null;
  facebook_handle: string | null;
  twitter_handle: string | null;
  linkedin_handle: string | null;
  messaging_apps: MessagingApp[];
  relationship_type: string | null;
  notes: string | null;
  linked_profile_id: string | null;
  linked_profile?: LinkedProfile | null;
  avatar_url: string | null;
  phone_contact_id: string | null;
  notification_sound: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone_numbers?: PhoneNumber[];
  email_addresses?: EmailAddress[];
  instagram_handle?: string;
  facebook_handle?: string;
  twitter_handle?: string;
  linkedin_handle?: string;
  messaging_apps?: MessagingApp[];
  relationship_type?: string;
  notes?: string;
  avatar_url?: string;
  notification_sound?: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const RELATIONSHIP_TYPES = ['family', 'friend', 'colleague', 'other'] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

export const RELATIONSHIP_COLORS: Record<string, string> = {
  family: '#8B5CF6',
  friend: '#10B981',
  colleague: '#3B82F6',
  other: '#6B7280',
};

class ContactsApiService {
  private async getAuthHeaders(): Promise<{ Authorization: string; apikey: string } | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        console.error('No valid session for API call:', error);
        return null;
      }

      return {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
    } catch (error) {
      console.error('Error getting auth headers:', error);
      return null;
    }
  }

  private async makeApiCall<T>(
    queryParams: string,
    options: { body?: any; method?: string } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = await this.getAuthHeaders();

      if (!authHeaders) {
        return {
          success: false,
          error: 'Authentication required'
        };
      }

      const method = options.method || 'GET';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
      };

      if (method !== 'GET' && options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/contacts-api${queryParams}`,
        fetchOptions
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(`Contacts API call failed:`, data);
        return {
          success: false,
          error: data.error || 'API call failed',
          details: data.details,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Contacts API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Get all contacts with optional search and pagination
  async getContacts(
    search?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ contacts: Contact[]; pagination: Pagination }> {
    const params = new URLSearchParams({
      action: 'list',
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }

    const result = await this.makeApiCall<{
      contacts: Contact[];
      pagination: Pagination;
    }>(`?${params.toString()}`);

    if (result.success && result.data) {
      return {
        contacts: result.data.contacts || [],
        pagination: result.data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 },
      };
    }

    return { contacts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
  }

  // Get a single contact by ID
  async getContact(contactId: string): Promise<Contact | null> {
    const result = await this.makeApiCall<{ contact: Contact }>(
      `?action=get&contact_id=${contactId}`
    );

    if (result.success && result.data?.contact) {
      return result.data.contact;
    }

    return null;
  }

  // Create a contact
  async createContact(input: ContactInput): Promise<Contact | null> {
    const result = await this.makeApiCall<{ contact: Contact }>('?action=create', {
      method: 'POST',
      body: input,
    });

    if (result.success && result.data?.contact) {
      return result.data.contact;
    }

    return null;
  }

  // Update a contact
  async updateContact(contactId: string, input: Partial<ContactInput>): Promise<Contact | null> {
    const result = await this.makeApiCall<{ contact: Contact }>(
      `?action=update&contact_id=${contactId}`,
      {
        method: 'PUT',
        body: input,
      }
    );

    if (result.success && result.data?.contact) {
      return result.data.contact;
    }

    return null;
  }

  // Delete a contact
  async deleteContact(contactId: string): Promise<boolean> {
    const result = await this.makeApiCall(`?action=delete&contact_id=${contactId}`, {
      method: 'DELETE',
    });

    return result.success;
  }

  // Link contact to Knox profile
  async linkProfile(contactId: string, profileId: string): Promise<Contact | null> {
    const result = await this.makeApiCall<{ contact: Contact }>('?action=link_profile', {
      method: 'POST',
      body: { contact_id: contactId, profile_id: profileId },
    });

    if (result.success && result.data?.contact) {
      return result.data.contact;
    }

    return null;
  }

  // Unlink contact from Knox profile
  async unlinkProfile(contactId: string): Promise<Contact | null> {
    const result = await this.makeApiCall<{ contact: Contact }>('?action=unlink_profile', {
      method: 'POST',
      body: { contact_id: contactId },
    });

    if (result.success && result.data?.contact) {
      return result.data.contact;
    }

    return null;
  }
}

export const contactsApi = new ContactsApiService();
