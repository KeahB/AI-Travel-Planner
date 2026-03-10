export interface Itinerary {
  id?: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: 'economy' | 'moderate' | 'luxury';
  numericBudget?: string;
  interests: string[];
  content: string;
  userId: string;
  createdAt: any;
  rating?: number;
  feedback?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
