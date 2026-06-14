package eu.nt.xpenses.repositories

import eu.nt.xpenses.models.*
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import kotlinx.coroutines.flow.Flow

@Repository
interface UserRepository : CoroutineCrudRepository<User, Int> {
    suspend fun findByUsername(username: String): User?
}

@Repository
interface CategoryRepository : CoroutineCrudRepository<Category, Int> {
    suspend fun findByName(name: String): Category?
    fun findAllByIsActiveTrue(): Flow<Category>
}

@Repository
interface ExpenseReportRepository : CoroutineCrudRepository<ExpenseReport, Int> {
    fun findAllByUserId(userId: Int): Flow<ExpenseReport>
    fun findAllByStatus(status: String): Flow<ExpenseReport>
}

@Repository
interface ExpenseRepository : CoroutineCrudRepository<Expense, Int> {
    fun findAllByUserId(userId: Int): Flow<Expense>
    fun findAllByReportId(reportId: Int): Flow<Expense>
    fun findAllByStatus(status: String): Flow<Expense>
    
    @Query("SELECT * FROM expenses WHERE report_id IS NULL AND user_id = :userId")
    fun findUnattachedByUserId(userId: Int): Flow<Expense>
}

@Repository
interface ReceiptRepository : CoroutineCrudRepository<Receipt, Int> {
    fun findAllByExpenseId(expenseId: Int): Flow<Receipt>
}

@Repository
interface FxRateRepository : CoroutineCrudRepository<FxRate, Int> {
    suspend fun findByFromCurrencyAndToCurrencyAndRateDate(
        fromCurrency: String,
        toCurrency: String,
        rateDate: String
    ): FxRate?
}

@Repository
interface RefreshTokenRepository : CoroutineCrudRepository<RefreshToken, Int> {
    suspend fun findByTokenHash(tokenHash: String): RefreshToken?
    suspend fun deleteByUserId(userId: Int)
}

@Repository
interface AdvancePaymentRepository : CoroutineCrudRepository<AdvancePayment, Int> {
    fun findAllByReportId(reportId: Int): Flow<AdvancePayment>
    fun findAllByUserId(userId: Int): Flow<AdvancePayment>
    fun findAllByStatus(status: String): Flow<AdvancePayment>
}

@Repository
interface MileageRecordRepository : CoroutineCrudRepository<MileageRecord, Int> {
    fun findAllByReportId(reportId: Int): Flow<MileageRecord>
    fun findAllByUserId(userId: Int): Flow<MileageRecord>
}

@Repository
interface AppSettingRepository : CoroutineCrudRepository<AppSetting, String> {
    suspend fun findByKey(key: String): AppSetting?
}
