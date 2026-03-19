import type { VenueType, SportType } from '../constants/sports';

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  sportTypes: SportType[];
  address: string;
  addressDetail: string | null;
  lat: number;
  lng: number;
  city: string;
  district: string;
  phone: string | null;
  description: string | null;
  imageUrls: string[];
  facilities: string[];
  operatingHours: OperatingHours;
  pricePerHour: number | null;
  rating: number;
  reviewCount: number;
}

export interface OperatingHours {
  [day: string]: {
    open: string;
    close: string;
    closed?: boolean;
  };
}

export interface VenueReview {
  id: string;
  venueId: string;
  userId: string;
  rating: number;
  facilityRating: number;
  accessRating: number;
  costRating: number;
  comment: string | null;
  imageUrls: string[];
  createdAt: string;
}
