"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ListingDetails } from "@/lib/listing-details";

export function ListingDetailsEditor({
  value,
  onChange,
}: {
  value: ListingDetails;
  onChange: (value: ListingDetails) => void;
}) {
  const prefix = useId();
  const patch = (changes: Partial<ListingDetails>) =>
    onChange({ ...value, ...changes });
  const selectClass =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm";
  return (
    <div className="space-y-6 border-t border-slate-200 pt-6">
      <section className="space-y-3">
        <h3 className="font-semibold">Rooms & beds</h3>
        <p className="text-sm text-slate-500">
          Describe each sleeping area, including shared spaces. For example:
          Bedroom 1, one queen bed.
        </p>
        {value.rooms.map((room, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor={`${prefix}-room-${index}`}>Room name</Label>
              <Input
                id={`${prefix}-room-${index}`}
                maxLength={80}
                value={room.name}
                onChange={(e) =>
                  patch({
                    rooms: value.rooms.map((r, i) =>
                      i === index ? { ...r, name: e.target.value } : r,
                    ),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-beds-${index}`}>Beds and sizes</Label>
              <Input
                id={`${prefix}-beds-${index}`}
                maxLength={300}
                value={room.beds}
                onChange={(e) =>
                  patch({
                    rooms: value.rooms.map((r, i) =>
                      i === index ? { ...r, beds: e.target.value } : r,
                    ),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({ rooms: value.rooms.filter((_, i) => i !== index) })
              }
            >
              Remove room {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.rooms.length >= 30}
          onClick={() =>
            patch({
              rooms: [
                ...value.rooms,
                { name: `Bedroom ${value.rooms.length + 1}`, beds: "" },
              ],
            })
          }
        >
          Add sleeping area
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Bathroom details</h3>
        <p className="text-sm text-slate-500">
          Specify private or shared access and full or half bathrooms. Keep the
          bathroom count above consistent with these details.
        </p>
        {(value.bathroomDetails ?? []).map((bathroom, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor={`${prefix}-bathroom-${index}`}>
                Bathroom name
              </Label>
              <Input
                id={`${prefix}-bathroom-${index}`}
                maxLength={80}
                value={bathroom.name}
                onChange={(e) =>
                  patch({
                    bathroomDetails: value.bathroomDetails!.map((b, i) =>
                      i === index ? { ...b, name: e.target.value } : b,
                    ),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-bath-description-${index}`}>
                Access and facilities
              </Label>
              <Input
                id={`${prefix}-bath-description-${index}`}
                maxLength={300}
                value={bathroom.description}
                placeholder="Private full bath with step-free shower"
                onChange={(e) =>
                  patch({
                    bathroomDetails: value.bathroomDetails!.map((b, i) =>
                      i === index ? { ...b, description: e.target.value } : b,
                    ),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({
                  bathroomDetails: value.bathroomDetails!.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              Remove bathroom {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={(value.bathroomDetails?.length ?? 0) >= 30}
          onClick={() =>
            patch({
              bathroomDetails: [
                ...(value.bathroomDetails ?? []),
                {
                  name: `Bathroom ${(value.bathroomDetails?.length ?? 0) + 1}`,
                  description: "",
                },
              ],
            })
          }
        >
          Add bathroom details
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Fees & deposits</h3>
        <p className="text-sm text-slate-500">
          List charges in USD separately from monthly rent. Include cleaning,
          application, pet and security charges when applicable. These are
          disclosures; payment terms are agreed directly with the traveler.
        </p>
        {value.fees.map((fee, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor={`${prefix}-fee-${index}`}>Charge name</Label>
              <Input
                id={`${prefix}-fee-${index}`}
                maxLength={80}
                value={fee.name}
                onChange={(e) =>
                  patch({
                    fees: value.fees.map((f, i) =>
                      i === index ? { ...f, name: e.target.value } : f,
                    ),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-amount-${index}`}>Amount (USD)</Label>
              <Input
                id={`${prefix}-amount-${index}`}
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={fee.amount}
                onChange={(e) =>
                  patch({
                    fees: value.fees.map((f, i) =>
                      i === index
                        ? { ...f, amount: Number(e.target.value) }
                        : f,
                    ),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-frequency-${index}`}>
                When charged
              </Label>
              <select
                id={`${prefix}-frequency-${index}`}
                className={selectClass}
                value={fee.frequency}
                onChange={(e) =>
                  patch({
                    fees: value.fees.map((f, i) =>
                      i === index
                        ? {
                            ...f,
                            frequency: e.target.value as "once" | "monthly",
                          }
                        : f,
                    ),
                  })
                }
              >
                <option value="once">One time</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`${prefix}-refund-${index}`}>Refund terms</Label>
              <select
                id={`${prefix}-refund-${index}`}
                className={selectClass}
                value={fee.refundable ? "yes" : "no"}
                onChange={(e) =>
                  patch({
                    fees: value.fees.map((f, i) =>
                      i === index
                        ? { ...f, refundable: e.target.value === "yes" }
                        : f,
                    ),
                  })
                }
              >
                <option value="no">Nonrefundable</option>
                <option value="yes">Refundable, subject to rental terms</option>
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({ fees: value.fees.filter((_, i) => i !== index) })
              }
            >
              Remove charge {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.fees.length >= 20}
          onClick={() =>
            patch({
              fees: [
                ...value.fees,
                { name: "", amount: 0, refundable: false, frequency: "once" },
              ],
            })
          }
        >
          Add fee or deposit
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">House rules</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${prefix}-smoking`}>Smoking policy</Label>
            <select
              id={`${prefix}-smoking`}
              className={selectClass}
              value={value.smoking}
              onChange={(e) =>
                patch({ smoking: e.target.value as ListingDetails["smoking"] })
              }
            >
              <option value="unspecified">Not specified</option>
              <option value="prohibited">Smoking prohibited</option>
              <option value="allowed">Smoking allowed</option>
            </select>
          </div>
          <div>
            <Label htmlFor={`${prefix}-vehicles`}>
              Maximum vehicles (optional)
            </Label>
            <Input
              id={`${prefix}-vehicles`}
              type="number"
              min={0}
              max={30}
              step={1}
              value={value.maxVehicles ?? ""}
              onChange={(e) =>
                patch({
                  maxVehicles:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <div>
          <Label htmlFor={`${prefix}-rules`}>Additional rules</Label>
          <Textarea
            id={`${prefix}-rules`}
            maxLength={4000}
            value={value.rules}
            onChange={(e) => patch({ rules: e.target.value })}
            placeholder="Quiet hours, guests, shared spaces and pet restrictions"
          />
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Nearby facilities</h3>
        <p className="text-sm text-slate-500">
          Add nearby hospitals, workplaces or transit. Distances are your
          estimates in miles and will be labeled that way.
        </p>
        {value.facilities.map((facility, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor={`${prefix}-facility-${index}`}>
                Facility name
              </Label>
              <Input
                id={`${prefix}-facility-${index}`}
                maxLength={160}
                value={facility.name}
                onChange={(e) =>
                  patch({
                    facilities: value.facilities.map((f, i) =>
                      i === index ? { ...f, name: e.target.value } : f,
                    ),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${prefix}-distance-${index}`}>
                Estimated distance (miles)
              </Label>
              <Input
                id={`${prefix}-distance-${index}`}
                type="number"
                min={0}
                max={500}
                step="0.1"
                value={facility.miles}
                onChange={(e) =>
                  patch({
                    facilities: value.facilities.map((f, i) =>
                      i === index ? { ...f, miles: Number(e.target.value) } : f,
                    ),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({
                  facilities: value.facilities.filter((_, i) => i !== index),
                })
              }
            >
              Remove facility {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.facilities.length >= 20}
          onClick={() =>
            patch({ facilities: [...value.facilities, { name: "", miles: 0 }] })
          }
        >
          Add nearby facility
        </Button>
      </section>
    </div>
  );
}
