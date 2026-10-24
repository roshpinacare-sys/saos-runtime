package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// Replica מייצג צומת במערכת העיבוד
// Load מייצג את רמת העומס הנוכחית של הצומת
// Capacity מייצג את הקיבולת המרבית של הצומת
type Replica struct {
	ID       string
	Load     float64
	Capacity float64
	mutex    sync.Mutex
}

// LoadBalancer מייצג את מנהל העומס ההיברידי
type LoadBalancer struct {
	Replicas    []*Replica
	History     map[string][]float64 // היסטוריית עומס לכל replica
	RecoveryRate float64               // קצב התאוששות איטי
	mutex       sync.Mutex
}

// NewLoadBalancer יוצר מנהל עומס חדש עם replicas מרובים
func NewLoadBalancer(capacity float64, replicaCount int) *LoadBalancer {
	lb := &LoadBalancer{
		Replicas:    make([]*Replica, replicaCount),
		History:     make(map[string][]float64),
		RecoveryRate: 0.1, // קצב התאוששות איטי
	}

	// אתחול ה-replicas
	for i := 0; i < replicaCount; i++ {
		replica := &Replica{
			ID:       fmt.Sprintf("replica-%d", i),
			Load:     0,
			Capacity: capacity,
		}
		lb.Replicas[i] = replica
		lb.History[replica.ID] = make([]float64, 0)
	}

	return lb
}

// AddWork מוסיף עבודה ל-replica עם חלוקת עומס היברידית
func (lb *LoadBalancer) AddWork(work float64) (string, error) {
	lb.mutex.Lock()
	defer lb.mutex.Unlock()

	// בחירת replica היברידית:
	// 1. ברירת מחדל: ה-replica הפחות עמוס (round-robin במקרה של שוויון)
	// 2. אם נמצא צוואר בקבוק, נעביר עומס ל-replica פחות עמוס
	selectedReplica, err := lb.selectReplica()
	if err != nil {
		return "", err
	}

	// הוספת העבודה
	selectedReplica.mutex.Lock()
	selectedReplica.Load += work
	selectedReplica.mutex.Unlock()

	// עדכון ההיסטוריה
	lb.History[selectedReplica.ID] = append(lb.History[selectedReplica.ID], selectedReplica.Load)

	return selectedReplica.ID, nil
}

// selectReplica בוחר את ה-replica המתאים לפי אלגוריתם היברידי
func (lb *LoadBalancer) selectReplica() (*Replica, error) {
	// מציאת ה-replica הפחות עמוס
	minLoad := float64(1<<63 - 1)
	var candidates []*Replica

	for _, replica := range lb.Replicas {
		replica.mutex.Lock()
		if replica.Load < minLoad {
			minLoad = replica.Load
			candidates = []*Replica{replica}
		} else if replica.Load == minLoad {
			candidates = append(candidates, replica)
		}
		replica.mutex.Unlock()
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no available replicas")
	}

	// בחירת round-robin מהמועמדים
	selected := candidates[rand.Intn(len(candidates))]

	// בדיקה אם יש צורך ב-work stealing
	if lb.needsWorkStealing(selected) {
		return lb.findBestWorkStealingTarget(selected), nil
	}

	return selected, nil
}

// needsWorkStealing בודק אם יש צורך ב-work stealing
func (lb *LoadBalancer) needsWorkStealing(selected *Replica) bool {
	selected.mutex.Lock()
	defer selected.mutex.Unlock()

	// אם ה-load על ה-replica הנבחר גבוה מ-80% מהקיבולת
	if selected.Load/selected.Capacity > 0.8 {
		// בדיקה האם יש אחר עם פחות מ-50% עומס
		for _, replica := range lb.Replicas {
			replica.mutex.Lock()
			if replica.ID != selected.ID && replica.Load/replica.Capacity < 0.5 {
				replica.mutex.Unlock()
				return true
			}
			replica.mutex.Unlock()
		}
	}

	return false
}

// findBestWorkStealingTarget מוצא את היעד הטוב ביותר ל-work stealing
func (lb *LoadBalancer) findBestWorkStealingTarget(source *Replica) *Replica {
	var bestTarget *Replica
	lowestLoad := float64(1<<63 - 1)

	for _, replica := range lb.Replicas {
		replica.mutex.Lock()
		if replica.ID != source.ID && replica.Load < lowestLoad {
			lowestLoad = replica.Load
			bestTarget = replica
		}
		replica.mutex.Unlock()
	}

	return bestTarget
}

// PerformWorkStealing מבצע work stealing בין replicas
func (lb *LoadBalancer) PerformWorkStealing(sourceID, targetID string, amount float64) error {
	lb.mutex.Lock()
	defer lb.mutex.Unlock()

	var source, target *Replica
	for _, replica := range lb.Replicas {
		if replica.ID == sourceID {
			source = replica
		} else if replica.ID == targetID {
			target = replica
		}
	}

	if source == nil || target == nil {
		return fmt.Errorf("invalid replica IDs")
	}

	source.mutex.Lock()
	target.mutex.Lock()
	defer source.mutex.Unlock()
	defer target.mutex.Unlock()

	// העברת העומס
	if source.Load >= amount {
		source.Load -= amount
		target.Load += amount
		
		// עדכון ההיסטוריה
		lb.History[source.ID] = append(lb.History[source.ID], source.Load)
		lb.History[target.ID] = append(lb.History[target.ID], target.Load)
		return nil
	}

	return fmt.Errorf("not enough load to steal")
}

// RecoverLoads מיישם התאוששות איטית של העומסים
func (lb *LoadBalancer) RecoverLoads() {
	lb.mutex.Lock()
	defer lb.mutex.Unlock()

	for _, replica := range lb.Replicas {
		replica.mutex.Lock()
		// הפחתת העומס בקצב התאוששות איטי
		replica.Load *= (1 - lb.RecoveryRate)
		replica.mutex.Unlock()
		
		// עדכון ההיסטוריה
		lb.History[replica.ID] = append(lb.History[replica.ID], replica.Load)
	}
}

// GetStatus מחזיר את מצב המערכת
func (lb *LoadBalancer) GetStatus() map[string]float64 {
	status := make(map[string]float64)

	for _, replica := range lb.Replicas {
		replica.mutex.Lock()
		status[replica.ID] = replica.Load / replica.Capacity
		replica.mutex.Unlock()
	}

	return status
}

// RunSimulation מריץ סימולציה של מנהל העומס
func RunSimulation() {
	// אתחול מנהל העומס עם 3 replicas, כל אחד עם קיבולת 100
	lb := NewLoadBalancer(100.0, 3)

	// הגרלת זרע לסימולציה
	rand.Seed(time.Now().UnixNano())

	// הפעלת 100 משימות אקראיות
	for i := 0; i < 100; i++ {
		work := rand.Float64() * 20.0 // עבודה בין 0 ל-20
		_, err := lb.AddWork(work)
		if err != nil {
			fmt.Printf("Error adding work: %v\n", err)
		}

		// בדיקה אם יש צורך ב-work stealing אקראית
		if rand.Float64() < 0.1 { // 10% הסתברות
			status := lb.GetStatus()
			for sourceID, loadRatio := range status {
				if loadRatio > 0.8 {
					// מציאת target ל-work stealing
					var targetID string
					minLoad := 1.0
					for id, ratio := range status {
						if ratio < minLoad {
							minLoad = ratio
							targetID = id
						}
					}
					
					if targetID != "" {
						amount := rand.Float64() * 10.0 // כמות להעברה
						err := lb.PerformWorkStealing(sourceID, targetID, amount)
						if err != nil {
							fmt.Printf("Error in work stealing: %v\n", err)
						} else {
							fmt.Printf("Work stealing: %s -> %s (%.2f)\n", sourceID, targetID, amount)
						}
					}
					break
				}
			}
		}

		// התאוששות איטית כל 20 משימות
		if i%20 == 0 {
			lb.RecoverLoads()
		}

		// הדפסת מצב כל 20 משימות
		if i%20 == 0 {
			status := lb.GetStatus()
			fmt.Printf("After %d tasks: %v\n", i, status)
		}
	}

	// הדפסת סיכום סופי
	fmt.Println("Final status:")
	status := lb.GetStatus()
	for id, loadRatio := range status {
		fmt.Printf("%s: %.2f%% load\n", id, loadRatio*100)
	}
}

func main() {
	fmt.Println("Starting hybrid load balancing simulation...")
	RunSimulation()
}