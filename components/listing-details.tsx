import type { ListingDetails as Details } from "@/lib/listing-details";
const money = (amount: number) =>
  amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
export function ListingDetails({
  details,
  maxOccupancy,
  petFriendly,
}: {
  details?: Details;
  maxOccupancy?: number;
  petFriendly: boolean;
}) {
  return (
    <div className="space-y-6">
      {!!details?.rooms.length && (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-slate-900">
            Rooms & beds
          </h2>
          <dl className="space-y-2">
            {details.rooms.map((room, i) => (
              <div key={i} className="rounded-xl border p-3">
                <dt className="font-medium text-slate-900">{room.name}</dt>
                <dd className="whitespace-pre-line text-sm text-slate-600">
                  {room.beds}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {!!details?.bathroomDetails?.length && (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-slate-900">
            Bathroom details
          </h2>
          <dl className="space-y-2">
            {details.bathroomDetails.map((bathroom, i) => (
              <div key={i} className="rounded-xl border p-3">
                <dt className="font-medium text-slate-900">{bathroom.name}</dt>
                <dd className="whitespace-pre-line text-sm text-slate-600">
                  {bathroom.description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-[17px] font-semibold text-slate-900">
          Fees & deposits
        </h2>
        {details?.fees.length ? (
          <>
            <dl className="space-y-3">
              {details.fees.map((fee, i) => (
                <div key={i} className="flex justify-between gap-4 text-sm">
                  <dt>
                    <span className="font-medium text-slate-900">
                      {fee.name}
                    </span>
                    <p className="text-slate-500">
                      {fee.frequency === "monthly" ? "Monthly" : "One time"} ·{" "}
                      {fee.refundable
                        ? "Refundable, subject to rental terms"
                        : "Nonrefundable"}
                    </p>
                  </dt>
                  <dd className="shrink-0 font-medium">{money(fee.amount)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Charges are listed by the owner separately from monthly rent.
              Confirm payment timing and refund conditions in your rental
              agreement.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No fee details supplied. Ask the owner about additional charges and
            deposits.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-[17px] font-semibold text-slate-900">
          House rules
        </h2>
        <ul className="space-y-2 text-sm text-slate-600">
          {maxOccupancy !== undefined && (
            <li>Maximum occupancy: {maxOccupancy}</li>
          )}
          {details?.maxVehicles !== undefined && (
            <li>Maximum vehicles: {details.maxVehicles}</li>
          )}
          <li>
            {petFriendly
              ? "Pets allowed; confirm restrictions with the owner"
              : "Pets not allowed"}
          </li>
          <li>
            {details?.smoking === "allowed"
              ? "Smoking allowed"
              : details?.smoking === "prohibited"
                ? "Smoking prohibited"
                : "Smoking policy not specified"}
          </li>
        </ul>
        {details?.rules && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-600">
            {details.rules}
          </p>
        )}
      </section>
      {!!details?.facilities.length && (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-slate-900">
            Nearby facilities
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Owner-provided estimates; distances are not verified routes or
            commute times.
          </p>
          <dl className="space-y-2 text-sm">
            {details.facilities.map((facility, i) => (
              <div key={i} className="flex justify-between gap-4">
                <dt className="text-slate-600">{facility.name}</dt>
                <dd className="shrink-0">{facility.miles} miles</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
