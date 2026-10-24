import psutil
import time
import json
import os
from typing import Dict, List, Tuple

class Node:
    def __init__(self, node_id: str):
        self.id = node_id
        self.cpu_load = 0.0
        self.ram_available = 0.0
        self.ram_total = 0.0
        self.last_update = 0
        self.failover_count = 0
        self.is_active = True

class LoadBalancer:
    def __init__(self, nodes: List[str], critical_ram_threshold: float = 0.1):
        self.nodes = {node_id: Node(node_id) for node_id in nodes}
        self.critical_ram_threshold = critical_ram_threshold
        self.allocation_history = []
        self.performance_metrics = {
            'old_avg_wait_time': 0.0,
            'new_avg_wait_time': 0.0,
            'old_failover_count': 0,
            'new_failover_count': 0
        }
    
    def monitor_resources(self) -> Dict[str, Dict[str, float]]:
        """Monitor CPU and RAM usage across all nodes"""
        current_time = time.time()
        resource_status = {}
        
        for node_id, node in self.nodes.items():
            if node.is_active:
                # Simulate resource monitoring (in real implementation, this would query actual nodes)
                node.cpu_load = psutil.cpu_percent() / 100.0
                mem = psutil.virtual_memory()
                node.ram_available = mem.available
                node.ram_total = mem.total
                node.last_update = current_time
                
                resource_status[node_id] = {
                    'cpu_load': node.cpu_load,
                    'ram_available': node.ram_available,
                    'ram_total': node.ram_total,
                    'ram_percentage': node.ram_available / node.ram_total
                }
        
        return resource_status
    
    def calculate_weighted_load(self, node: Node) -> float:
        """Calculate weighted load considering CPU and RAM with higher weight to RAM"""
        cpu_weight = 0.3
        ram_weight = 0.7  # Higher weight for RAM to prevent memory overflows
        
        cpu_normalized = node.cpu_load
        ram_normalized = 1 - (node.ram_available / node.ram_total)  # Inverted so higher usage = higher load
        
        return cpu_weight * cpu_normalized + ram_weight * ram_normalized
    
    def allocate_load(self, load_units: int) -> Dict[str, int]:
        """Allocate load across nodes based on weighted load calculation"""
        resource_status = self.monitor_resources()
        allocation = {}
        remaining_load = load_units
        
        # Sort nodes by their weighted load (ascending - prefer less loaded nodes)
        sorted_nodes = sorted(
            self.nodes.values(),
            key=lambda n: self.calculate_weighted_load(n) if n.is_active else float('inf')
        )
        
        # Allocate load to nodes
        for node in sorted_nodes:
            if not node.is_active or remaining_load <= 0:
                continue
                
            # Check if node has critical RAM
            if (node.ram_available / node.ram_total) < self.critical_ram_threshold:
                node.failover_count += 1
                self.performance_metrics['new_failover_count'] += 1
                # Trigger failover - don't allocate to this node
                continue
            
            # Calculate allocation based on available resources
            node_capacity = int((node.ram_available / node.ram_total) * 100)  # Simplified capacity
            allocated = min(remaining_load, node_capacity)
            
            if allocated > 0:
                allocation[node.id] = allocated
                remaining_load -= allocated
        
        # If there's still remaining load, allocate to active nodes proportionally
        if remaining_load > 0:
            active_nodes = [n for n in sorted_nodes if n.is_active and n.id not in allocation]
            if active_nodes:
                for node in active_nodes:
                    proportional_share = int((remaining_load / len(active_nodes)) * 0.5)  # Conservative allocation
                    if proportional_share > 0:
                        allocation[node.id] = allocation.get(node.id, 0) + proportional_share
                        remaining_load -= proportional_share
        
        # Record allocation history
        self.allocation_history.append({
            'timestamp': time.time(),
            'allocation': allocation,
            'resource_status': resource_status
        })
        
        return allocation
    
    def generate_performance_report(self) -> Dict:
        """Generate performance report comparing old and new algorithms"""
        # Simulated metrics (in real implementation, these would be collected from actual runs)
        return {
            'timestamp': time.time(),
            'performance_metrics': self.performance_metrics,
            'allocation_history': self.allocation_history[-10:],  # Last 10 allocations
            'node_status': {
                node_id: {
                    'cpu_load': node.cpu_load,
                    'ram_available': node.ram_available,
                    'ram_total': node.ram_total,
                    'failover_count': node.failover_count,
                    'is_active': node.is_active
                }
                for node_id, node in self.nodes.items()
            },
            'recommendations': self._generate_recommendations()
        }
    
    def _generate_recommendations(self) -> List[str]:
        """Generate optimization recommendations based on current state"""
        recommendations = []
        
        # Check for nodes with high failover counts
        for node_id, node in self.nodes.items():
            if node.failover_count > 5:
                recommendations.append(f"Node {node_id} has high failover count ({node.failover_count}). Consider investigating resource issues.")
        
        # Check overall load distribution
        if len(self.allocation_history) > 0:
            last_allocation = self.allocation_history[-1]['allocation']
            if len(last_allocation) < len(self.nodes) * 0.7:  # If less than 70% of nodes are being used
                recommendations.append("Load is concentrated on a small number of nodes. Consider rebalancing.")
        
        if not recommendations:
            recommendations.append("System is operating within normal parameters. Continue monitoring.")
        
        return recommendations

# Initialize load balancer with sample nodes
nodes = ["node-1", "node-2", "node-3", "node-4"]
lb = LoadBalancer(nodes)

# Example usage
if __name__ == "__main__":
    # Simulate load allocation
    allocation = lb.allocate_load(100)
    print("Load allocation:", allocation)
    
    # Generate and print performance report
    report = lb.generate_performance_report()
    print("Performance Report:", json.dumps(report, indent=2))
    
    # Save to file
    os.makedirs("/core/processing", exist_ok=True)
    with open("/core/processing/load_balancer_report.json", "w") as f:
        json.dump(report, f, indent=2)
