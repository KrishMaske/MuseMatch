import type { Artwork } from './artwork.js';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  /** A few images for the collection cover mosaic. */
  previewImageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetail extends Collection {
  items: CollectionItem[];
}

export interface CollectionItem {
  id: string;
  artwork: Artwork;
  createdAt: string;
}

export interface CreateCollectionInput {
  name: string;
  description?: string | null;
}

export type UpdateCollectionInput = Partial<CreateCollectionInput>;
