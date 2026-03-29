# Tool Catalog

Total tools: **143**

## Count By Category

| Category | Tools |
|---|---:|
| access | 12 |
| backup | 8 |
| cluster | 8 |
| firewall | 12 |
| lxc | 18 |
| monitoring | 25 |
| network | 8 |
| nodes | 2 |
| pools | 5 |
| qemu | 22 |
| remote | 5 |
| storage | 8 |
| tasks | 4 |
| templates | 6 |

## Tools

| Tool | Category | Tier | Module | Destructive | Confirm | Idempotent | Deprecated |
|---|---|---|---|---|---|---|---|
| pve_list_nodes | nodes | read-only | core | false | false | true | false |
| pve_get_node_status | nodes | read-only | core | false | false | true | false |
| pve_list_qemu_vms | qemu | read-only | core | false | false | true | false |
| pve_get_qemu_status | qemu | read-only | core | false | false | true | false |
| pve_list_lxc_containers | lxc | read-only | core | false | false | true | false |
| pve_get_lxc_status | lxc | read-only | core | false | false | true | false |
| pve_get_cluster_status | cluster | read-only | core | false | false | true | false |
| pve_list_storage | storage | read-only | core | false | false | true | false |
| pve_list_tasks | tasks | read-only | core | false | false | true | false |
| pve_get_task_status | tasks | read-only | core | false | false | true | false |
| pve_get_task_log | tasks | read-only | core | false | false | true | false |
| pve_list_networks | network | read-only | core | false | false | true | false |
| pve_list_pools | pools | read-only | core | false | false | true | false |
| pve_list_users | access | read-only | advanced | false | false | true | false |
| pve_list_cluster_firewall_rules | firewall | read-only | advanced | false | false | true | false |
| pve_list_backup_jobs | backup | read-only | core | false | false | true | false |
| pve_get_qemu_config | qemu | read-only | core | false | false | true | false |
| pve_get_lxc_config | lxc | read-only | core | false | false | true | false |
| pve_run_remote_diagnostic | remote | read-execute | core | false | false | true | false |
| pve_ssh_batch_diagnostics | remote | read-only | core | false | false | true | false |
| pve_exec_in_container | remote | full | advanced | true | true | false | false |
| pve_docker_ps_in_container | remote | read-execute | advanced | false | false | true | false |
| pve_docker_logs_in_container | remote | read-execute | advanced | false | false | true | false |
| listVMs | qemu | read-only | core | false | false | true | true |
| listContainers | lxc | read-only | core | false | false | true | true |
| pve_start_qemu_vm | qemu | read-execute | core | true | false | false | false |
| pve_stop_qemu_vm | qemu | read-execute | core | true | true | false | false |
| pve_shutdown_qemu_vm | qemu | read-execute | core | true | true | false | false |
| pve_reboot_qemu_vm | qemu | read-execute | core | true | true | false | false |
| pve_reset_qemu_vm | qemu | read-execute | core | true | true | false | false |
| pve_suspend_qemu_vm | qemu | read-execute | core | true | true | false | false |
| pve_resume_qemu_vm | qemu | read-execute | core | true | false | false | false |
| pve_start_lxc_container | lxc | read-execute | core | true | false | false | false |
| pve_stop_lxc_container | lxc | read-execute | core | true | true | false | false |
| pve_shutdown_lxc_container | lxc | read-execute | core | true | true | false | false |
| pve_reboot_lxc_container | lxc | read-execute | core | true | true | false | false |
| pve_suspend_lxc_container | lxc | read-execute | core | true | true | false | false |
| pve_resume_lxc_container | lxc | read-execute | core | true | false | false | false |
| pve_get_node_metrics_hour | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_metrics_hour | monitoring | read-only | core | false | false | true | false |
| pve_get_lxc_metrics_hour | monitoring | read-only | core | false | false | true | false |
| pve_get_node_metrics_day | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_metrics_day | monitoring | read-only | core | false | false | true | false |
| pve_get_lxc_metrics_day | monitoring | read-only | core | false | false | true | false |
| pve_get_node_metrics_week | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_metrics_week | monitoring | read-only | core | false | false | true | false |
| pve_get_lxc_metrics_week | monitoring | read-only | core | false | false | true | false |
| pve_get_node_metrics_month | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_metrics_month | monitoring | read-only | core | false | false | true | false |
| pve_get_lxc_metrics_month | monitoring | read-only | core | false | false | true | false |
| pve_get_node_metrics_year | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_metrics_year | monitoring | read-only | core | false | false | true | false |
| pve_get_lxc_metrics_year | monitoring | read-only | core | false | false | true | false |
| pve_qemu_create | qemu | full | core | false | false | false | false |
| pve_qemu_delete | qemu | full | core | true | true | false | false |
| pve_qemu_migrate | qemu | read-execute | core | true | true | false | false |
| pve_qemu_clone | qemu | full | core | false | false | false | false |
| pve_qemu_update_config | qemu | full | core | true | true | true | false |
| pve_qemu_resize_disk | qemu | full | core | true | true | false | false |
| pve_qemu_create_snapshot | qemu | full | core | false | false | false | false |
| pve_qemu_delete_snapshot | qemu | full | core | true | true | false | false |
| pve_qemu_rollback_snapshot | qemu | full | core | true | true | false | false |
| pve_qemu_create_template | qemu | full | core | true | true | false | false |
| pve_lxc_create | lxc | full | core | false | false | false | false |
| pve_lxc_delete | lxc | full | core | true | true | false | false |
| pve_lxc_migrate | lxc | read-execute | core | true | true | false | false |
| pve_lxc_clone | lxc | full | core | false | false | false | false |
| pve_lxc_update_config | lxc | full | core | true | true | true | false |
| pve_lxc_create_snapshot | lxc | full | core | false | false | false | false |
| pve_lxc_delete_snapshot | lxc | full | core | true | true | false | false |
| pve_lxc_rollback_snapshot | lxc | full | core | true | true | false | false |
| pve_get_cluster_log | cluster | read-only | core | false | false | true | false |
| pve_get_cluster_options | cluster | read-only | core | false | false | true | false |
| pve_get_next_vmid | cluster | read-only | core | false | false | true | false |
| pve_list_cluster_resources | cluster | read-only | core | false | false | true | false |
| pve_list_cluster_replication | cluster | read-only | core | false | false | true | false |
| pve_get_cluster_ha_status | cluster | read-only | core | false | false | true | false |
| pve_list_cluster_backup_info | cluster | read-only | core | false | false | true | false |
| pve_get_storage_config | storage | read-only | core | false | false | true | false |
| pve_list_node_storage | storage | read-only | core | false | false | true | false |
| pve_get_storage_status | storage | read-only | core | false | false | true | false |
| pve_list_storage_content | storage | read-only | core | false | false | true | false |
| pve_get_backup_job | backup | read-only | core | false | false | true | false |
| pve_list_backups | backup | read-only | core | false | false | true | false |
| pve_get_network | network | read-only | core | false | false | true | false |
| pve_list_node_bridges | network | read-only | core | false | false | true | false |
| pve_list_node_bonds | network | read-only | core | false | false | true | false |
| pve_list_node_physical_nics | network | read-only | core | false | false | true | false |
| pve_get_pool | pools | read-only | core | false | false | true | false |
| pve_list_roles | access | read-only | advanced | false | false | true | false |
| pve_list_groups | access | read-only | advanced | false | false | true | false |
| pve_list_acls | access | read-only | advanced | false | false | true | false |
| pve_list_domains | access | read-only | advanced | false | false | true | false |
| pve_list_api_tokens | access | read-only | advanced | false | false | true | false |
| pve_get_qemu_cloudinit_dump | templates | read-only | core | false | false | true | false |
| pve_list_qemu_templates | templates | read-only | core | false | false | true | false |
| pve_list_iso_images | templates | read-only | core | false | false | true | false |
| pve_list_storage_templates | templates | read-only | core | false | false | true | false |
| pve_get_cluster_firewall_options | firewall | read-only | advanced | false | false | true | false |
| pve_list_cluster_firewall_aliases | firewall | read-only | advanced | false | false | true | false |
| pve_list_cluster_firewall_ipsets | firewall | read-only | advanced | false | false | true | false |
| pve_list_guest_firewall_rules | firewall | read-only | advanced | false | false | true | false |
| pve_get_cluster_metrics_overview | monitoring | read-only | core | false | false | true | false |
| pve_get_node_version | monitoring | read-only | core | false | false | true | false |
| pve_get_node_dns | monitoring | read-only | core | false | false | true | false |
| pve_get_node_time | monitoring | read-only | core | false | false | true | false |
| pve_get_node_syslog | monitoring | read-only | core | false | false | true | false |
| pve_list_node_services | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_agent_info | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_agent_network | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_agent_osinfo | monitoring | read-only | core | false | false | true | false |
| pve_get_qemu_agent_fsinfo | monitoring | read-only | core | false | false | true | false |
| pve_create_storage | storage | full | core | false | false | false | false |
| pve_update_storage | storage | full | core | true | true | false | false |
| pve_delete_storage | storage | full | core | true | true | false | false |
| pve_run_backup | backup | read-execute | core | false | false | false | false |
| pve_create_backup_job | backup | full | core | false | false | false | false |
| pve_delete_backup_job | backup | full | core | true | true | false | false |
| pve_restore_qemu_backup | backup | full | core | true | true | false | false |
| pve_restore_lxc_backup | backup | full | core | true | true | false | false |
| pve_stop_task | tasks | full | core | true | true | false | false |
| pve_create_network | network | full | core | false | false | false | false |
| pve_update_network | network | full | core | true | true | false | false |
| pve_delete_network | network | full | core | true | true | false | false |
| pve_create_pool | pools | full | core | false | false | false | false |
| pve_update_pool | pools | full | core | true | true | false | false |
| pve_delete_pool | pools | full | core | true | true | false | false |
| pve_create_user | access | full | advanced | false | false | false | false |
| pve_update_user | access | full | advanced | true | true | false | false |
| pve_delete_user | access | full | advanced | true | true | false | false |
| pve_update_acl | access | full | advanced | true | true | false | false |
| pve_create_api_token | access | full | advanced | false | false | false | false |
| pve_delete_api_token | access | full | advanced | true | true | false | false |
| pve_update_cluster_firewall_options | firewall | full | advanced | true | true | false | false |
| pve_create_cluster_firewall_rule | firewall | full | advanced | false | false | false | false |
| pve_update_cluster_firewall_rule | firewall | full | advanced | true | true | false | false |
| pve_delete_cluster_firewall_rule | firewall | full | advanced | true | true | false | false |
| pve_create_guest_firewall_rule | firewall | full | advanced | false | false | false | false |
| pve_update_guest_firewall_rule | firewall | full | advanced | true | true | false | false |
| pve_delete_guest_firewall_rule | firewall | full | advanced | true | true | false | false |
| pve_set_qemu_cloudinit | templates | full | core | true | true | false | false |
| pve_create_qemu_template | templates | full | core | true | true | false | false |
| pve_exec_qemu_guest_command | qemu | full | core | true | true | false | false |
