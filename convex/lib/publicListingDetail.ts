import type { listingPhotos } from "./photos";
/** Full traveler-visible property content, excluding owner editing/publication metadata. */
export function publicListingDetail(
  view: Awaited<ReturnType<typeof listingPhotos>>,
) {
  return {
    _id: view._id,
    landlordId: view.landlordId,
    publicId: view.publicId,
    title: view.title,
    description: view.description,
    city: view.city,
    state: view.state,
    address: "",
    zip: "",
    price: view.price,
    bedrooms: view.bedrooms,
    bathrooms: view.bathrooms,
    maxOccupancy: view.maxOccupancy,
    details: view.details,
    propertyType: view.propertyType,
    amenities: view.amenities,
    photos: view.photos,
    photoCaptions: view.photoCaptions,
    petFriendly: view.petFriendly,
    parkingIncluded: view.parkingIncluded,
    utilitiesIncluded: view.utilitiesIncluded,
    availableFrom: view.availableFrom,
    minStay: view.minStay,
    status: view.status,
    propertyGroupId: view.propertyGroupId,
    unitName: view.unitName,
    mapLatitude: view.mapLatitude,
    mapLongitude: view.mapLongitude,
    featured: view.featured,
    views: view.views,
    createdAt: view.createdAt,
  };
}
