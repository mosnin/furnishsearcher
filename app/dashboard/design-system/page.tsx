"use client";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import {
  Button,
  Input,
  ActionLink,
  SelectField,
  CheckField,
  PageHeader,
  Widget,
  Status,
  Metric,
  Empty,
  Modal,
  ViewTabs,
} from "@/components/ui-system/primitives";
import { MotionSamples } from "@/components/public-experience/motion";
import { dashboardDNA } from "@/components/ui-system/dna";

export default function ComponentLibrary() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [checked, setChecked] = useState(true);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("components");
  return (
    <div className="ds-page">
      <PageHeader
        title="Component library"
        description="The shared foundations of your rental workspace."
        action={<ActionLink href="/dashboard">Back to home</ActionLink>}
      />
      <ViewTabs
        value={view}
        onValueChange={setView}
        tabs={[
          { value: "components", label: "Components" },
          { value: "foundations", label: "Foundations" },
        ]}
      >
        {view === "components" ? (
          <div className="ds-library-grid">
            <Widget
              title="Actions"
              description="Primary, secondary, quiet and destructive"
            >
              <div className="ds-library-samples">
                <Button
                  onClick={() => setMessage("Primary sample action completed.")}
                >
                  Primary action
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setMessage("Secondary sample action completed.")
                  }
                >
                  Secondary
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMessage("Quiet sample action completed.")}
                >
                  Quiet action
                </Button>
                <Button disabled>Unavailable</Button>
                <Button variant="danger" onClick={() => setOpen(true)}>
                  Open confirmation
                </Button>
                <Menu.Root>
                  <Menu.Trigger
                    render={
                      <Button variant="secondary" aria-label="Sample actions" />
                    }
                  >
                    <DotsThree size={18} />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <div className="furnish-ui ds-portal">
                      <Menu.Positioner sideOffset={5}>
                        <Menu.Popup className="ds-menu">
                          <Menu.Item
                            className="ds-menu-item"
                            onClick={() =>
                              setMessage("Sample menu action selected.")
                            }
                          >
                            Sample action
                          </Menu.Item>
                          <Menu.Item className="ds-menu-item" disabled>
                            Unavailable action
                          </Menu.Item>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </div>
                  </Menu.Portal>
                </Menu.Root>
              </div>
              <div className="ds-widget-body">
                <p role="status" className="ds-caption">
                  {message || "Specimen controls affect only this workshop."}
                </p>
              </div>
            </Widget>
            <Widget
              title="Form controls"
              description="Labels, required state and form submission"
            >
              <form
                className="ds-widget-body ds-workshop-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMessage(
                    `Sample form submitted for ${name}. No property was changed.`,
                  );
                }}
              >
                <label className="ds-field">
                  Property name
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name your sample property"
                    maxLength={120}
                  />
                </label>
                <SelectField
                  label="Sample status"
                  value={status}
                  onValueChange={setStatus}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "review", label: "In review" },
                    { value: "active", label: "Active" },
                  ]}
                />
                <CheckField checked={checked} onCheckedChange={setChecked}>
                  Include hidden sample units
                </CheckField>
                <Button type="submit">Submit sample</Button>
              </form>
            </Widget>
            <Widget
              title="Status"
              description="Meaning is always carried by text"
            >
              <div className="ds-library-samples">
                <Status>Draft</Status>
                <Status tone="positive">Active</Status>
                <Status tone="caution">Needs attention</Status>
                <Status tone="critical">Rejected</Status>
              </div>
            </Widget>
            <Widget
              title="Empty state"
              description="Useful guidance when there is no data"
            >
              <Empty
                title="No matching properties"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setMessage("Sample filters cleared.")}
                  >
                    Clear sample filters
                  </Button>
                }
              >
                Broaden your search to see more properties.
              </Empty>
            </Widget>
            <Widget
              title="Metric states"
              className="ds-full"
              description="Explicit loading and unavailable values"
            >
              <div className="ds-metrics">
                <Metric
                  label="Sample count"
                  value="12"
                  detail="Specimen data"
                />
                <Metric
                  label="Sample unavailable"
                  value="—"
                  detail="No collection coverage"
                />
                <Metric
                  label="Sample loading"
                  value=""
                  detail="Checking saved records"
                  loading
                />
                <Metric
                  label="Sample empty"
                  value="0"
                  detail="Confirmed empty result"
                />
              </div>
            </Widget>
          </div>
        ) : (
          <div className="ds-library-grid">
            <Widget
              title="Surfaces"
              description="Company OS monochrome surface ladder"
            >
              <div className="ds-swatches">
                {Object.entries(dashboardDNA.surface).map(([name, color]) => (
                  <div key={name}>
                    <span style={{ background: color }} />
                    <strong>{name}</strong>
                    <small>{color}</small>
                  </div>
                ))}
              </div>
            </Widget>
            <Widget title="Typography & geometry">
              <div className="ds-widget-body ds-type-specimen">
                <h1>Page title</h1>
                <h2>Section title</h2>
                <p>
                  Body copy supports decisions without competing with the data.
                </p>
                <small>Caption and supporting context</small>
                <dl>
                  <dt>Top bar</dt>
                  <dd>56px</dd>
                  <dt>Sidebar</dt>
                  <dd>240px</dd>
                  <dt>Controls</dt>
                  <dd>28px buttons · 32px fields</dd>
                  <dt>Surfaces</dt>
                  <dd>8px controls · 12px cards</dd>
                </dl>
              </div>
            </Widget>
          </div>
        )}
      </ViewTabs>
      <MotionSamples />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Confirm sample action"
        description="This is an interaction specimen. It does not modify rental or account data."
      >
        <footer className="ds-dialog-footer">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setMessage(
                "Sample confirmation completed. No rental data changed.",
              );
              setOpen(false);
            }}
          >
            Confirm sample
          </Button>
        </footer>
      </Modal>
    </div>
  );
}
