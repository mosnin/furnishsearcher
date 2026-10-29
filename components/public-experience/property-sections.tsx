"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui-system/primitives";
import { formatPrice } from "@/lib/utils";

export function PropertySectionNav({
  price,
  showRooms,
}: {
  price: number;
  showRooms: boolean;
}) {
  const [active, setActive] = useState("photos");
  const [visible, setVisible] = useState(false);
  const links = [
    ["photos", "Photos"],
    ["about", "About"],
    ...(showRooms ? [["sleep", "Sleep"]] : []),
    ["amenities", "Amenities"],
    ["reviews", "Reviews"],
    ["location", "Location"],
    ["rules", "Rules"],
  ];
  useEffect(() => {
    const update = () => {
      const gallery = document.getElementById("photos");
      setVisible(!!gallery && gallery.getBoundingClientRect().bottom < 120);
      const sections = links
        .map(([key]) => document.getElementById(key))
        .filter(Boolean) as HTMLElement[];
      const current = sections
        .filter((section) => section.getBoundingClientRect().top <= 160)
        .at(-1);
      if (current) setActive(current.id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [showRooms]);
  return (
    <nav
      className="w-property-section-nav"
      data-visible={visible}
      aria-label="Property sections"
    >
      <div className="w-property-section-links">
        {links.map(([key, label]) => (
          <a
            href={`#${key}`}
            key={key}
            aria-current={active === key ? "location" : undefined}
          >
            {label}
          </a>
        ))}
      </div>
      <div className="w-property-nav-request">
        <span>
          <strong>{formatPrice(price)}</strong>
          <small>per month</small>
        </span>
        <a href="#stay-request">Request stay</a>
      </div>
    </nav>
  );
}

export function PropertyDescription({ description }: { description: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const long = description.length > 320;
  return (
    <>
      <p className="w-property-description">
        {long ? `${description.slice(0, 320).trim()}…` : description}
      </p>
      {long && (
        <button
          ref={trigger}
          className="w-property-pill"
          onClick={() => setOpen(true)}
        >
          Read more
        </button>
      )}
      <Modal
        title="About the property"
        open={open}
        onOpenChange={setOpen}
        className="w-property-text-dialog"
        finalFocus={trigger}
      >
        <p className="w-property-description">{description}</p>
      </Modal>
    </>
  );
}

export function PropertyAmenities({
  amenities,
  renderIcon,
}: {
  amenities: string[];
  renderIcon: (name: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement | null>(null);
  const list = (items: string[]) => (
    <div className="w-property-amenities">
      {items.map((name) => (
        <div key={name}>
          {renderIcon(name)}
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      {list(amenities.slice(0, 8))}
      {amenities.length > 8 && (
        <button
          ref={trigger}
          className="w-property-pill"
          onClick={() => setOpen(true)}
        >
          Show all {amenities.length} amenities
        </button>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Amenities"
        className="w-property-text-dialog"
        finalFocus={trigger}
      >
        {list(amenities)}
      </Modal>
    </>
  );
}
