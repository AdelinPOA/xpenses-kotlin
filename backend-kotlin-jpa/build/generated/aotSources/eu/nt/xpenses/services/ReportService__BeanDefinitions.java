package eu.nt.xpenses.services;

import eu.nt.xpenses.repositories.ReportRepository;
import org.springframework.aot.generate.Generated;
import org.springframework.beans.factory.aot.BeanInstanceSupplier;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.RootBeanDefinition;

/**
 * Bean definitions for {@link ReportService}.
 */
@Generated
public class ReportService__BeanDefinitions {
  /**
   * Get the bean instance supplier for 'reportService'.
   */
  private static BeanInstanceSupplier<ReportService> getReportServiceInstanceSupplier() {
    return BeanInstanceSupplier.<ReportService>forConstructor(ReportRepository.class)
            .withGenerator((registeredBean, args) -> new ReportService(args.get(0)));
  }

  /**
   * Get the bean definition for 'reportService'.
   */
  public static BeanDefinition getReportServiceBeanDefinition() {
    RootBeanDefinition beanDefinition = new RootBeanDefinition(ReportService.class);
    beanDefinition.setInstanceSupplier(getReportServiceInstanceSupplier());
    return beanDefinition;
  }
}
