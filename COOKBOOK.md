# COOKBOOK: Use Cases

In this cookbook you will find example prompts in English that you can copy and paste into the assistant to automate common system tasks across academic management, finance, infrastructure, and maintenance.

## Academic management
- Enroll a new student named "Mateo González" at the Palermo campus, morning shift, half-day schedule, and assign him to Green Room.
- Register the withdrawal of student "Sofía Pérez" with date 2026-03-31 and reason "school transfer", and notify the responsible family.
- Create a new family for "Lucía Fernández", add two guardians with phone and email, and link them to student "Tomás Fernández".
- Assign teacher "Carla Ríos" to Blue Room for a full-day schedule at the Belgrano campus starting on 2026-04-01.
- List all active students at the Recoleta campus grouped by schedule and room, and export the result to Excel.

## Financial management
- Generate the March 2026 monthly invoice for family ID 23 including enrollment and tuition fees, and leave it in PENDING status.
- Register a payment of 50,000 ARS for invoice 1024 with today's date and update its status to PAID.
- Show all overdue invoices at the Palermo campus, calculate late fees, and send an email reminder to each guardian.
- Generate a monthly financial report by campus with total billed, total collected, and outstanding balance for March 2026.
- Detect duplicate payments from the last 30 days, flag suspicious transactions, and prepare an audit report.

## Infrastructure operations
- Optimize Proxmox nodes by shutting down VMs with no traffic in the last 24 hours and generate an estimated savings summary.
- Generate a table report of CPU, RAM, and disk usage for all Proxmox VMs over the last 24 hours.
- Validate the status of all critical containers, restart degraded ones, and confirm they return to a healthy state.
- Run a full database backup, store it in `/backup/dialogosystem`, and verify the integrity of the generated file.

## Deployment and maintenance
- Restart the API container, verify `/api/health`, and confirm expected latency and response code.
- Deploy the latest update to production and run smoke tests for `/api/ninos`, `/api/familiares`, and `/api/docentes`.
- Run nightly maintenance: update project Docker containers, clean up orphan images, and report affected services.
- Run a remote command diagnostic on Proxmox to check SSH connectivity, disk space, and stopped services on primary hosts.

## Usage note
- You can adapt each prompt by changing names, IDs, campuses, dates, and amounts based on your daily operations.
