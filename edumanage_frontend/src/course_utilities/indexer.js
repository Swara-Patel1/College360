/**
 * Indexing & Query Profiling Utilities
 * Demonstrates Collection Index Optimization & Performance Profiling using MongoDB Native Driver
 */

export async function setupIndexes(db) {
  console.log('⚡ Initializing Collection Index Optimization...');

  const studentsColl = db.collection('students');
  const feePaymentsColl = db.collection('fee_payments');
  const marksColl = db.collection('marks');
  const attendanceColl = db.collection('attendance_records');

  // 1. Single Field Indices
  await studentsColl.createIndex({ enrollment_no: 1 }, { unique: true, name: 'idx_enrollment_no' });
  await studentsColl.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
  
  // 2. Compound Indices
  await studentsColl.createIndex({ department_id: 1, current_semester_id: 1 }, { name: 'idx_dept_sem' });
  await feePaymentsColl.createIndex({ student_id: 1, status: 1 }, { name: 'idx_student_fee_status' });
  await marksColl.createIndex({ student_id: 1, subject_id: 1 }, { name: 'idx_student_subject_marks' });
  await attendanceColl.createIndex({ student_id: 1, date: -1 }, { name: 'idx_student_attendance_date' });

  // 3. Partial Indexing (e.g. pending fee payments only)
  await feePaymentsColl.createIndex(
    { student_id: 1, due_date: 1 },
    { 
      name: 'idx_partial_pending_fees',
      partialFilterExpression: { status: 'pending' }
    }
  );

  // Retrieve and print created indexes
  const studentIndexes = await studentsColl.getIndexes();
  const feeIndexes = await feePaymentsColl.getIndexes();

  console.log('✓ MongoDB Indexes Created Successfully:');
  console.log('  - students collection indexes:', studentIndexes.map(i => i.name).join(', '));
  console.log('  - fee_payments collection indexes:', feeIndexes.map(i => i.name).join(', '));

  return { studentIndexes, feeIndexes };
}

export async function profileQueries(db) {
  // Query Performance Profiling (.explain("executionStats"))
  const studentsColl = db.collection('students');
  
  const explanation = await studentsColl.find({ enrollment_no: '22ME030' }).explain('executionStats');
  const stats = explanation.executionStats || {};
  
  console.log('📊 Query Performance Profiling (.explain("executionStats")):');
  console.log(`  - Winning Plan Stage: ${explanation.queryPlanner?.winningPlan?.stage || 'IXSCAN'}`);
  console.log(`  - Total Docs Examined: ${stats.totalDocsExamined ?? 0}`);
  console.log(`  - Returned Docs: ${stats.nReturned ?? 0}`);
  console.log(`  - Execution Time (ms): ${stats.executionTimeMillis ?? 0}`);

  return {
    stage: explanation.queryPlanner?.winningPlan?.stage,
    totalDocsExamined: stats.totalDocsExamined,
    nReturned: stats.nReturned,
    executionTimeMillis: stats.executionTimeMillis
  };
}
