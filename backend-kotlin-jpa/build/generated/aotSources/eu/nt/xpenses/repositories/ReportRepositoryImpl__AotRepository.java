package eu.nt.xpenses.repositories;

import eu.nt.xpenses.models.Report;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.lang.String;
import java.util.List;
import java.util.Optional;
import org.springframework.aot.generate.Generated;
import org.springframework.data.jpa.repository.aot.AotRepositoryFragmentSupport;
import org.springframework.data.jpa.repository.query.QueryEnhancerSelector;
import org.springframework.data.repository.core.support.RepositoryFactoryBeanSupport;
import org.springframework.data.repository.query.Param;

/**
 * AOT generated JPA repository implementation for {@link ReportRepository}.
 */
@Generated
public class ReportRepositoryImpl__AotRepository extends AotRepositoryFragmentSupport {
  private final RepositoryFactoryBeanSupport.FragmentCreationContext context;

  private final EntityManager entityManager;

  public ReportRepositoryImpl__AotRepository(EntityManager entityManager,
      RepositoryFactoryBeanSupport.FragmentCreationContext context) {
    super(QueryEnhancerSelector.DEFAULT_SELECTOR, context);
    this.entityManager = entityManager;
    this.context = context;
  }

  /**
   * AOT generated implementation of {@link ReportRepository#findAllWithExpenses()}.
   */
  public List<Report> findAllWithExpenses() {
    String queryString = "SELECT DISTINCT r FROM Report r LEFT JOIN FETCH r.expenses";
    Query query = this.entityManager.createQuery(queryString);

    return (List<Report>) query.getResultList();
  }

  /**
   * AOT generated implementation of {@link ReportRepository#findByIdWithExpenses(long)}.
   */
  public Optional<Report> findByIdWithExpenses(@Param("id") long id) {
    String queryString = "SELECT r FROM Report r LEFT JOIN FETCH r.expenses WHERE r.id = :id";
    Query query = this.entityManager.createQuery(queryString);
    query.setParameter("id", id);

    return Optional.ofNullable((Report) convertOne(query.getSingleResultOrNull(), false, Report.class));
  }
}
